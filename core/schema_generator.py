"""Generate a SchemaPlan from natural language using the LLM."""

from __future__ import annotations

import json
import re
from typing import Any

from core.llm_client import ollama_chat_json
from core.schema_types import ColumnPlan, SchemaPlan, TablePlan, expect_bool, expect_list, expect_str

_SAFE_IDENT = re.compile(r"^[a-zA-Z][a-zA-Z0-9_]*$")


def assert_safe_identifier(name: str, label: str) -> None:
    if not _SAFE_IDENT.match(name):
        raise ValueError(f"{label} must match {_SAFE_IDENT.pattern}: {name!r}")


SCHEMA_SYSTEM_PROMPT = """You are a database architect for MariaDB.

Return ONLY valid JSON. No markdown fences. No explanations.

You must return a JSON object with this shape:
{
  "database_name": null | "string",
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "sql_type": "INT|VARCHAR(255)|DATE|DECIMAL(10,2)|TEXT|DATETIME|BOOLEAN|...",
          "is_nullable": true|false,
          "is_primary_key": true|false,
          "is_auto_increment": true|false,
          "default": null | "SQL literal expression",
          "references": null | "other_table.other_column"
        }
      ],
      "unique_indexes": [["colA"], ["colB","colC"]],
      "indexes": [["colX"], ["colY","colZ"]]
    }
  ]
}

Rules:
- Use snake_case for table and column names.
- Every table MUST have a primary key, usually `id` INT auto increment.
- Use InnoDB-safe types.
- For references, use integer foreign keys that point to the referenced PK.
- Prefer NOT NULL for required fields; allow NULL only when it makes sense.
- Keep it minimal: do not invent too many columns.
"""


def generate_schema_plan(*, user_request: str, timeout_s: float = 180.0) -> SchemaPlan:
    raw = ollama_chat_json(system=SCHEMA_SYSTEM_PROMPT, user=user_request, timeout_s=timeout_s)
    data = _parse_json_strict(raw)
    return _parse_schema_plan(data)


def schema_plan_from_dict(data: dict[str, Any]) -> SchemaPlan:
    """Parse/validate a schema plan coming from the UI editor."""
    return _parse_schema_plan(data)


def _parse_json_strict(text: str) -> dict[str, Any]:
    # Ollama format=json should already enforce JSON, but be strict anyway.
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model did not return valid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValueError("Top-level JSON must be an object")
    return data


def _coerce_optional(val: Any) -> Any:
    """Treat empty/whitespace strings from the AI as absent (None)."""
    if isinstance(val, str) and not val.strip():
        return None
    return val


def _parse_schema_plan(data: dict[str, Any]) -> SchemaPlan:
    database_name = data.get("database_name")
    if database_name is not None:
        database_name = expect_str(database_name, "database_name")
        # allow only safe identifiers when provided
        assert_safe_identifier(database_name, "database_name")

    tables_raw = expect_list(data.get("tables"), "tables")
    tables: list[TablePlan] = []
    for i, t in enumerate(tables_raw):
        if not isinstance(t, dict):
            raise ValueError(f"tables[{i}] must be an object")
        table_name = expect_str(t.get("name"), f"tables[{i}].name")
        assert_safe_identifier(table_name, f"tables[{i}].name")

        columns_raw = expect_list(t.get("columns"), f"tables[{i}].columns")
        columns: list[ColumnPlan] = []
        has_pk = False
        for j, c in enumerate(columns_raw):
            if not isinstance(c, dict):
                raise ValueError(f"tables[{i}].columns[{j}] must be an object")
            col_name = expect_str(c.get("name"), f"tables[{i}].columns[{j}].name")
            assert_safe_identifier(col_name, f"tables[{i}].columns[{j}].name")
            sql_type = expect_str(c.get("sql_type"), f"tables[{i}].columns[{j}].sql_type")
            is_nullable = expect_bool(c.get("is_nullable"), f"tables[{i}].columns[{j}].is_nullable")
            is_pk = expect_bool(c.get("is_primary_key", False), f"tables[{i}].columns[{j}].is_primary_key")
            is_ai = expect_bool(
                c.get("is_auto_increment", False), f"tables[{i}].columns[{j}].is_auto_increment"
            )
            default = _coerce_optional(c.get("default"))
            if default is not None:
                default = expect_str(default, f"tables[{i}].columns[{j}].default")
            references = _coerce_optional(c.get("references"))
            if references is not None:
                references = expect_str(references, f"tables[{i}].columns[{j}].references")
                # Be tolerant: if the model returns an invalid reference string, ignore it.
                # The user can still refine it in the UI.
                if "." in references:
                    ref_table, ref_col = references.split(".", 1)
                    assert_safe_identifier(ref_table, f"tables[{i}].columns[{j}].references.table")
                    assert_safe_identifier(ref_col, f"tables[{i}].columns[{j}].references.column")
                else:
                    references = None

            if is_pk:
                has_pk = True

            columns.append(
                ColumnPlan(
                    name=col_name,
                    sql_type=sql_type,
                    is_nullable=is_nullable,
                    is_primary_key=is_pk,
                    is_auto_increment=is_ai,
                    default=default,
                    references=references,
                )
            )

        if not has_pk:
            raise ValueError(f"Table {table_name!r} must include a primary key column")

        unique_indexes = _parse_index_list(t.get("unique_indexes", []), f"tables[{i}].unique_indexes")
        indexes = _parse_index_list(t.get("indexes", []), f"tables[{i}].indexes")

        tables.append(TablePlan(name=table_name, columns=columns, unique_indexes=unique_indexes, indexes=indexes))

    if not tables:
        raise ValueError("Plan must include at least one table")
    return SchemaPlan(database_name=database_name, tables=tables)


def _parse_index_list(obj: Any, label: str) -> list[list[str]]:
    items = expect_list(obj, label)
    parsed: list[list[str]] = []
    for i, idx in enumerate(items):
        cols_any = expect_list(idx, f"{label}[{i}]")
        cols: list[str] = []
        for j, col in enumerate(cols_any):
            col_name = expect_str(col, f"{label}[{i}][{j}]")
            assert_safe_identifier(col_name, f"{label}[{i}][{j}]")
            cols.append(col_name)
        if not cols:
            raise ValueError(f"{label}[{i}] must have at least one column")
        parsed.append(cols)
    return parsed

