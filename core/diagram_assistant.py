"""Diagram assistant for `/diagram` chat command.

We prefer deterministic generators for schema diagrams, and use the LLM for
other Mermaid diagram types (sequence/state/mindmap/etc.).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

from core.introspect import list_columns, list_foreign_key_constraints, list_tables
from core.llm_client import ollama_chat_json


@dataclass(frozen=True)
class MermaidPlan:
    code: str
    title: str | None = None


SYSTEM_PROMPT = """You generate Mermaid diagrams.

Return ONLY valid JSON. No markdown fences. No explanations.

Output shape:
{
  "title": "short title (optional)",
  "code": "Mermaid code only"
}

Rules:
- The code MUST be valid Mermaid and start with a diagram keyword like:
  flowchart, sequenceDiagram, stateDiagram, classDiagram, erDiagram, mindmap, gantt, timeline, sankey, quadrantChart, requirementDiagram, etc.
- If the user asks for an ERD / entity relationship diagram, output `erDiagram`.
- If the user asks for a flowchart, output `flowchart LR` unless they specify another direction.
- Keep it compact and readable for demos.
- If the user requests a DB-related diagram, prefer using the SCHEMA CONTEXT.
"""


def build_schema_context() -> str:
    tables = list_tables()
    cols = list_columns()
    fks = list_foreign_key_constraints()

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
            lines.append(
                f"- {fk.table_name}.{fk.column_name} -> {fk.referenced_table_name}.{fk.referenced_column_name} "
                f"(on_update={fk.update_rule}, on_delete={fk.delete_rule})"
            )
    return "\n".join(lines)


def generate_mermaid_from_prompt(*, prompt: str, timeout_s: float = 120.0) -> MermaidPlan:
    ctx = build_schema_context()
    user = f"{ctx}\n\nUSER REQUEST:\n{prompt}"
    raw = ollama_chat_json(system=SYSTEM_PROMPT, user=user, timeout_s=timeout_s)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Model JSON must be an object")
    code = data.get("code")
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Model JSON must include non-empty 'code'")
    title = data.get("title")
    if title is not None and not isinstance(title, str):
        title = None
    return MermaidPlan(code=code.strip(), title=title.strip() if isinstance(title, str) else None)

