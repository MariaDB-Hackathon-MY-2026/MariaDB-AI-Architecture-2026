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


SYSTEM_PROMPT = """You are a MariaDB DML assistant. Return ONLY valid JSON. No markdown. No explanations.

You MUST always return ALL six fields below. Never omit any field.

{
  "operation": "insert",
  "title": "Insert 5 sample patients",
  "write_sql": "INSERT INTO `patients` (`col1`, `col2`) VALUES (?, ?), (?, ?)",
  "preview_sql": "",
  "params": ["value1", "value2", "value3", "value4"],
  "preview_params": []
}

=== FIELD RULES ===

operation: must be exactly one of: "insert" | "update" | "delete"

write_sql: ONE DML statement (INSERT, UPDATE, or DELETE). Never DDL (no DROP/ALTER/CREATE).
  Use ? placeholders — never inline values as literals.
  Use backtick-quoted table and column names.
  Multi-row INSERT: INSERT INTO `t` (`a`, `b`) VALUES (?, ?), (?, ?), (?, ?)

params: list of values for every ? in write_sql, in order.
  Number of ? must equal len(params) exactly.

preview_sql + preview_params:
  INSERT → set preview_sql="" and preview_params=[]  (server builds preview automatically)
  UPDATE/DELETE → preview_sql is a SELECT with the same WHERE clause as write_sql

=== INSERT RULES ===

- Include ALL columns EXCEPT those tagged "AUTO_INCREMENT — skip in INSERT".
- Nullable columns (marked NULL) must still appear in the INSERT column list.
- Never reuse values from "Existing rows" in SCHEMA CONTEXT.
- Use realistic, culturally diverse names — no placeholder names (John Doe, Alice, Bob, etc.).
- Derive email from the person's name (Siti Amirah → siti.amirah@example.com).
- All values across rows must be unique.

=== UPDATE RULES ===

- Use CASE WHEN for bulk updates. Always include ELSE `col` to avoid nullifying unmatched rows.
- Use actual primary key values from "Existing rows" — never invent ids.
- WHERE clause: IS NULL OR = 0 for numeric; IS NULL OR = '' for text.

=== DELETE RULES ===

- preview_sql must SELECT rows matching the same WHERE as write_sql.
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


def _extract_sql(data: dict, primary_key: str) -> str:
    """Return the SQL string, trying the primary key then common model aliases."""
    for key in (primary_key, "sql", "statement", "query", "dml",
                "insert_sql", "update_sql", "delete_sql"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    raise ValueError(f"{primary_key} must be a non-empty string — model returned: {list(data.keys())}")


def _infer_operation(data: dict, request: str) -> str:
    """Infer DML operation from write_sql or user request when the model omits it."""
    write_sql = str(data.get("write_sql", "")).lstrip().upper()
    if write_sql.startswith("INSERT"):
        return "insert"
    if write_sql.startswith("UPDATE"):
        return "update"
    if write_sql.startswith("DELETE"):
        return "delete"
    req = request.lower()
    if any(w in req for w in ("insert", "add", "sample", "create row", "new row")):
        return "insert"
    if any(w in req for w in ("update", "change", "set", "fill", "modify")):
        return "update"
    if any(w in req for w in ("delete", "remove", "drop row")):
        return "delete"
    raise ValueError("Could not determine operation (insert/update/delete) from model response")


def generate_write_plan(*, request: str, timeout_s: float = 120.0) -> WritePlan:
    ctx = build_schema_context()
    user = f"{ctx}\n\nUSER REQUEST:\n{request}"
    raw = ollama_chat_json(system=SYSTEM_PROMPT, user=user, timeout_s=timeout_s)
    data = _parse_json(raw)

    op_raw = data.get("operation")
    if not isinstance(op_raw, str) or not op_raw.strip():
        operation = _infer_operation(data, request)
    else:
        operation = op_raw.lower().strip()
    if operation not in ("insert", "update", "delete"):
        raise ValueError(f"operation must be insert/update/delete, got: {operation!r}")

    title = data.get("title") or request[:60]
    if not isinstance(title, str):
        title = request[:60]

    write_sql = _extract_sql(data, "write_sql")
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
