"""Natural language -> DML (INSERT/UPDATE/DELETE) write planner."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from core.db_executor import get_connection
from core.introspect import ColumnInfo, list_columns, list_foreign_keys, list_tables
from core.llm_client import ollama_chat_json


@dataclass(frozen=True)
class WritePlan:
    operation: str          # insert | update | delete
    title: str
    write_sql: str
    preview_sql: str        # safe SELECT showing rows that will be affected
    params: list[Any]
    preview_params: list[Any]


SYSTEM_PROMPT = """You are a MariaDB DML assistant.

Return ONLY valid JSON. No markdown. No explanations.

The user wants to INSERT, UPDATE, or DELETE rows using plain English.
Produce a write SQL statement AND a safe read-only SELECT that previews
the rows that will be affected (or inserted) BEFORE execution.

Output JSON shape:
{
  "operation": "insert" | "update" | "delete",
  "title": "short human-friendly title",
  "write_sql": "INSERT/UPDATE/DELETE ... with ? placeholders",
  "preview_sql": "SELECT ... that shows affected rows, with ? placeholders",
  "params": [values for write_sql placeholders in order],
  "preview_params": [values for preview_sql placeholders in order]
}

Rules:
- write_sql must be exactly ONE DML statement: INSERT, UPDATE, or DELETE.
- NEVER use DROP, TRUNCATE, ALTER, CREATE, or any DDL in write_sql.
- Always use ? placeholders — never inline user values as literals.
- Use only tables and columns from the SCHEMA CONTEXT below.
- Keep write_sql and preview_sql consistent — same WHERE conditions.

INSERT rules:
- Read the "Existing rows" block for the target table in SCHEMA CONTEXT before
  generating any values. Every value you generate MUST be completely absent from those
  existing rows. If a name, email, or any unique field already appears there, choose a
  different one.
- Read EVERY column listed under the target table. Include ALL of them in the INSERT
  column list and in params — EXCEPT columns tagged "AUTO_INCREMENT — skip in INSERT".
  Nullable columns (marked NULL) MUST still be included. Never omit any column.
- When inserting MULTIPLE rows use ONE multi-row INSERT:
    write_sql:  INSERT INTO t (col1, col2) VALUES (?, ?), (?, ?), (?, ?)
    params:     [row1col1, row1col2, row2col1, row2col2, row3col1, row3col2]
  Never emit separate INSERT statements.
- Each VALUES group must contain exactly as many ? as there are columns in the column
  list. The total number of ? must equal len(params) exactly.
- For INSERT set preview_sql to "" and preview_params to [].
  The server builds the preview automatically.

Sample data rules (INSERT only):
- NEVER reuse any value that appears in the "Existing rows" of the target table.
- NEVER use placeholder names: John Doe, Jane Doe, John Smith, Jane Smith,
  Alice, Bob, Charlie, Test User, Sample User, or similar generic names.
- Derive email from the person's actual name in that row
  (first_name="Siti", last_name="Amirah" → email="siti.amirah@example.com").
- Use realistic, culturally diverse names — vary gender, ethnicity, and style across rows.
- All generated values across all rows must be distinct from each other and from existing
  rows. No two rows may share the same name, email, or any other unique field.

UPDATE — fill-in-missing-values pattern:
- When the user says "fill in", "complete", "set missing", or similar, generate an
  UPDATE — NOT an INSERT.
- A column counts as "unfilled" when Existing rows show NULL, OR when a numeric column
  shows 0 (freshly-added integer/decimal columns default to 0, not NULL), OR when a
  text column shows an empty string.
- Identify every row where the target column is unfilled using that rule.
- Use a CASE WHEN to assign a value to each affected row. CRITICAL rules:
    1. Read the ACTUAL primary key values from "Existing rows" — do NOT invent ids.
       If Existing rows shows id=5,6,7,8 use those exact ids, not 1,2,3,4.
    2. ALWAYS include an ELSE clause to preserve current values for unmatched rows.
       Without ELSE, SQL returns NULL for unmatched rows and destroys data.
    3. If the user stated a minimum or maximum constraint (e.g. "minimum 2"),
       every generated value MUST satisfy that constraint.

    Example for a numeric column with minimum 2:
      write_sql:
        UPDATE `t` SET `col` = CASE
          WHEN `id` = 5 THEN ?
          WHEN `id` = 6 THEN ?
          WHEN `id` = 7 THEN ?
          ELSE `col`
        END
        WHERE `col` IS NULL OR `col` = 0
      params: [3, 2, 4]   ← all values >= 2 as required

  WHERE clause rules for numeric columns:
  - If the user stated a MINIMUM value N (e.g. "minimum 2", "at least 2", "start from 2"):
      WHERE `col` IS NULL OR `col` < N
    This catches NULL, 0, and any value already below the minimum (e.g. 1).
    Example for minimum 2:  WHERE `credit_hours` IS NULL OR `credit_hours` < 2
  - If no minimum was stated:
      WHERE `col` IS NULL OR `col` = 0
  For text columns: WHERE `col` IS NULL OR `col` = ''

- Infer or generate contextually appropriate values (infer gender from first_name,
  generate realistic phone numbers, credit hours between 2 and 4, etc.).
  Each row must get a sensible value that satisfies any user-stated constraints.
- preview_sql: SELECT the rows that will change — use the EXACT same WHERE condition
  as write_sql:
    SELECT * FROM `t` WHERE `col` IS NULL OR `col` < 2   ← (match write_sql's WHERE)
  preview_params: []

preview_sql rules (UPDATE / DELETE only):
- For DELETE/UPDATE: preview_sql must be a SELECT that returns the rows to be affected
  (match the same WHERE clause). preview_params must match its ? placeholders exactly.
- For INSERT: leave preview_sql as "" and preview_params as [].
"""


def _fetch_existing_rows(table: str, limit: int = 20) -> tuple[list[str], list[list[Any]]]:
    """Return (col_names, rows) for a sample of existing data in `table`."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM `{table}` LIMIT {limit}")
        col_names = [d[0] for d in (cur.description or [])]
        rows = [list(r) for r in cur.fetchall()]
        return col_names, rows
    except Exception:  # noqa: BLE001
        return [], []
    finally:
        conn.close()


def build_schema_context() -> str:
    tables = list_tables()
    cols = list_columns()
    fks = list_foreign_keys()

    by_table: dict[str, list[ColumnInfo]] = {t: [] for t in tables}
    for c in cols:
        by_table.setdefault(c.table_name, []).append(c)

    lines: list[str] = ["SCHEMA CONTEXT (every column listed — do not skip any):"]
    for t in tables:
        lines.append(f"- Table: {t}")
        table_cols = by_table.get(t, [])
        for c in table_cols:
            is_ai = "auto_increment" in (c.extra or "").lower()
            is_pk = c.column_key == "PRI"
            nullable = "NULL" if c.is_nullable else "NOT NULL"
            tags: list[str] = []
            if is_pk:
                tags.append("PRIMARY KEY")
            if is_ai:
                tags.append("AUTO_INCREMENT — skip in INSERT")
            tag_str = f" [{', '.join(tags)}]" if tags else ""
            lines.append(f"  Column: {c.column_name}  Type: {c.column_type}  {nullable}{tag_str}")

        # Inject existing rows so the model sees current data (NULLs and zeros shown explicitly)
        ex_cols, ex_rows = _fetch_existing_rows(t, limit=20)
        if ex_rows:
            lines.append(
                "  Existing rows (NULL = missing; 0 or 1 on a numeric column = "
                "likely default/unfilled, may need filling):"
            )
            lines.append("  " + " | ".join(ex_cols))
            for row in ex_rows:
                cells = []
                for v in row:
                    if v is None or str(v).strip() == "":
                        cells.append("NULL")
                    elif str(v) in ("0", "1"):
                        cells.append(f"{v} (may be unfilled default)")
                    else:
                        cells.append(str(v))
                lines.append("  " + " | ".join(cells))
        else:
            lines.append("  (table is empty — no existing data)")

    if fks:
        lines.append("FOREIGN KEYS:")
        for fk in fks:
            lines.append(
                f"- {fk.table_name}.{fk.column_name} -> "
                f"{fk.referenced_table_name}.{fk.referenced_column_name}"
            )
    return "\n".join(lines)


def generate_write_plan(*, request: str, timeout_s: float = 120.0) -> WritePlan:
    ctx = build_schema_context()
    user = f"{ctx}\n\nUSER REQUEST:\n{request}"
    raw = ollama_chat_json(system=SYSTEM_PROMPT, user=user, timeout_s=timeout_s)
    data = _parse_json(raw)

    operation = _expect_str(data.get("operation"), "operation").lower().strip()
    if operation not in ("insert", "update", "delete"):
        raise ValueError(f"operation must be insert/update/delete, got: {operation!r}")

    title = data.get("title") or request[:60]
    if not isinstance(title, str):
        title = request[:60]

    write_sql = _expect_str(data.get("write_sql"), "write_sql").strip()
    # INSERT previews are built server-side — allow empty preview_sql for inserts only.
    _preview_raw = data.get("preview_sql")
    if operation == "insert":
        preview_sql = str(_preview_raw).strip() if isinstance(_preview_raw, str) else ""
    else:
        preview_sql = _expect_str(_preview_raw, "preview_sql").strip()

    params = data.get("params", [])
    if not isinstance(params, list):
        params = []

    preview_params = data.get("preview_params", [])
    if not isinstance(preview_params, list):
        preview_params = []

    return WritePlan(
        operation=operation,
        title=str(title).strip(),
        write_sql=write_sql,
        preview_sql=preview_sql,
        params=params,
        preview_params=preview_params,
    )


def _parse_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Top-level JSON must be an object")
    return data


def _expect_str(obj: Any, label: str) -> str:
    if not isinstance(obj, str) or not obj.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return obj
