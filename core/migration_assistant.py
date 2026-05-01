"""Natural language -> safe migration SQL (ALTER/INDEX) generator."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from core.introspect import list_columns, list_foreign_key_constraints, list_tables
from core.llm_client import ollama_chat_json


@dataclass(frozen=True)
class MigrationPlan:
    title: str | None
    statements: list[str]


SYSTEM_PROMPT = """You are a MariaDB migration assistant.

Return ONLY valid JSON. No markdown. No explanations.

Goal: generate a SMALL set of safe migration statements for the user's request.

Output JSON shape:
{
  "title": "short title (optional)",
  "statements": ["SQL statement 1", "SQL statement 2"]
}

Rules:
- Allowed statements ONLY:
  - ALTER TABLE ...
  - CREATE INDEX ...
  - CREATE UNIQUE INDEX ...
- Never output: DROP DATABASE, CREATE/DROP USER, GRANT/REVOKE, TRUNCATE, DELETE, UPDATE, INSERT.
- Use ONLY tables/columns from the SCHEMA CONTEXT.
- Prefer minimal diffs. If the request is ambiguous, choose the safest minimal change.
- Use backticks for table/column names.
"""


def build_schema_context() -> str:
    tables = list_tables()
    cols = list_columns()
    fks = list_foreign_key_constraints()

    by_table: dict[str, list[str]] = {t: [] for t in tables}
    for c in cols:
        by_table.setdefault(c.table_name, []).append(f"{c.column_name} {c.column_type} nullable={c.is_nullable}")

    lines: list[str] = ["SCHEMA CONTEXT:"]
    for t in tables:
        lines.append(f"- {t}:")
        for c in by_table.get(t, []):
            lines.append(f"  - {c}")
    if fks:
        lines.append("FOREIGN KEYS:")
        for fk in fks:
            lines.append(
                f"- {fk.table_name}.{fk.column_name} -> {fk.referenced_table_name}.{fk.referenced_column_name} "
                f"(name={fk.constraint_name}, on_update={fk.update_rule}, on_delete={fk.delete_rule})"
            )
    return "\n".join(lines)


def generate_migration_plan(*, request: str, timeout_s: float = 120.0) -> MigrationPlan:
    ctx = build_schema_context()
    user = f"{ctx}\n\nUSER REQUEST:\n{request}"
    raw = ollama_chat_json(system=SYSTEM_PROMPT, user=user, timeout_s=timeout_s)
    data = _parse_json(raw)

    title = data.get("title")
    if title is not None and not isinstance(title, str):
        title = None

    stmts = data.get("statements")
    if not isinstance(stmts, list) or not stmts:
        raise ValueError("statements must be a non-empty list")
    out: list[str] = []
    for i, s in enumerate(stmts):
        if not isinstance(s, str) or not s.strip():
            raise ValueError(f"statements[{i}] must be a non-empty string")
        out.append(s.strip().rstrip(";").strip())
    return MigrationPlan(title=title.strip() if isinstance(title, str) else None, statements=out)


def _parse_json(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Top-level JSON must be an object")
    return data

