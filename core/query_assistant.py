"""Natural language -> read-only SELECT query generator."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from core.introspect import list_columns, list_foreign_keys, list_tables
from core.llm_client import ollama_chat_json


@dataclass(frozen=True)
class QueryPlan:
    sql: str
    params: list[Any]
    title: str | None = None


SYSTEM_PROMPT = """You are a MariaDB SQL assistant.

Return ONLY valid JSON. No markdown. No explanations.

Goal: produce a SINGLE read-only query for the user's question.

Output JSON shape:
{
  "title": "short title (optional)",
  "sql": "SELECT ... with ? placeholders",
  "params": [values matching placeholders in order]
}

Rules:
- Only SELECT (or WITH...SELECT). Never write/DDL.
- Use only tables/columns provided in the SCHEMA CONTEXT.
- Always use ? placeholders for user-provided values (no string interpolation).
- If the user provides IATA codes, prefer joining via airports.iata rather than comparing to *_airport_id.
- Keep result columns human-friendly (aliases).
- LIMIT results to 200 unless the question asks otherwise.
"""


def build_schema_context() -> str:
    tables = list_tables()
    cols = list_columns()
    fks = list_foreign_keys()

    by_table: dict[str, list[str]] = {t: [] for t in tables}
    for c in cols:
        by_table.setdefault(c.table_name, []).append(f"{c.column_name} {c.column_type}")

    lines: list[str] = ["SCHEMA CONTEXT:"]
    for t in tables:
        lines.append(f"- {t}:")
        for c in by_table.get(t, []):
            lines.append(f"  - {c}")
    if fks:
        lines.append("FOREIGN KEYS:")
        for fk in fks:
            lines.append(f"- {fk.table_name}.{fk.column_name} -> {fk.referenced_table_name}.{fk.referenced_column_name}")
    return "\n".join(lines)


def generate_query_plan(*, question: str, timeout_s: float = 120.0) -> QueryPlan:
    ctx = build_schema_context()
    user = f"{ctx}\n\nUSER QUESTION:\n{question}"
    raw = ollama_chat_json(system=SYSTEM_PROMPT, user=user, timeout_s=timeout_s)
    data = _parse_json(raw)
    sql = _expect_str(data.get("sql"), "sql")
    params = data.get("params", [])
    if not isinstance(params, list):
        raise ValueError("params must be a list")
    title = data.get("title")
    if title is not None and not isinstance(title, str):
        title = None
    return QueryPlan(sql=sql.strip(), params=params, title=title.strip() if isinstance(title, str) else None)


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

