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


SCHEMA_SYSTEM_PROMPT = """You are a senior database architect for MariaDB.

Return ONLY valid JSON. No markdown fences. No explanations. No extra text.

=== STUDY THIS EXAMPLE — follow this exact pattern ===

For "hospital management system" the CORRECT output is:
{
  "database_name": null,
  "tables": [
    {
      "name": "departments",
      "columns": [
        {"name": "id", "sql_type": "INT", "is_nullable": false, "is_primary_key": true, "is_auto_increment": true, "default": null, "references": null},
        {"name": "name", "sql_type": "VARCHAR(100)", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null}
      ],
      "unique_indexes": [], "indexes": []
    },
    {
      "name": "doctors",
      "columns": [
        {"name": "id", "sql_type": "INT", "is_nullable": false, "is_primary_key": true, "is_auto_increment": true, "default": null, "references": null},
        {"name": "name", "sql_type": "VARCHAR(150)", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null},
        {"name": "department_id", "sql_type": "INT", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": "departments.id"}
      ],
      "unique_indexes": [], "indexes": []
    },
    {
      "name": "patients",
      "columns": [
        {"name": "id", "sql_type": "INT", "is_nullable": false, "is_primary_key": true, "is_auto_increment": true, "default": null, "references": null},
        {"name": "full_name", "sql_type": "VARCHAR(150)", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null},
        {"name": "date_of_birth", "sql_type": "DATE", "is_nullable": true, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null}
      ],
      "unique_indexes": [], "indexes": []
    },
    {
      "name": "appointments",
      "columns": [
        {"name": "id", "sql_type": "INT", "is_nullable": false, "is_primary_key": true, "is_auto_increment": true, "default": null, "references": null},
        {"name": "patient_id", "sql_type": "INT", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": "patients.id"},
        {"name": "doctor_id", "sql_type": "INT", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": "doctors.id"},
        {"name": "appointment_date", "sql_type": "DATETIME", "is_nullable": false, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null},
        {"name": "notes", "sql_type": "TEXT", "is_nullable": true, "is_primary_key": false, "is_auto_increment": false, "default": null, "references": null}
      ],
      "unique_indexes": [], "indexes": []
    }
  ]
}

KEY OBSERVATIONS about the example above:
- doctors has department_id with "references": "departments.id" — doctors belong to a department
- appointments has patient_id with "references": "patients.id" AND doctor_id with "references": "doctors.id"
- appointments links TWO tables so it has TWO FK columns — this is a junction/bridge table
- patients and departments have NO FK columns — they are root/parent tables

=== MANDATORY FK RULES ===

RULE 1 — Child tables need a FK to their parent:
  doctors belongs to departments → doctors MUST have department_id FK
  orders belong to customers → orders MUST have customer_id FK
  products belong to categories → products MUST have category_id FK

RULE 2 — Junction/bridge tables MUST have a FK for EACH related entity:
  appointments links patients + doctors → MUST have BOTH patient_id FK AND doctor_id FK
  enrollments links students + courses → MUST have BOTH student_id FK AND course_id FK
  order_items links orders + products → MUST have BOTH order_id FK AND product_id FK

RULE 3 — FK column format (non-negotiable):
  "references": "other_table.id"   ← NEVER null for FK columns
  "sql_type": "INT"
  "is_nullable": false
  "is_primary_key": false
  "is_auto_increment": false

RULE 4 — Every system with 3+ tables MUST have at least 2 FK relationships.

=== JSON FORMAT ===

{
  "database_name": null,
  "tables": [
    {
      "name": "table_name",
      "columns": [
        {
          "name": "column_name",
          "sql_type": "INT|VARCHAR(255)|DATE|DECIMAL(10,2)|TEXT|DATETIME|BOOLEAN|TINYINT(1)",
          "is_nullable": true|false,
          "is_primary_key": true|false,
          "is_auto_increment": true|false,
          "default": null,
          "references": null | "other_table.id"
        }
      ],
      "unique_indexes": [],
      "indexes": []
    }
  ]
}

GENERAL RULES:
- snake_case for all names.
- Every table MUST have an id INT PRIMARY KEY AUTO_INCREMENT.
- InnoDB-safe types only.
- Do not add extra columns beyond what is needed.
"""


def generate_schema_plan(*, user_request: str, timeout_s: float = 180.0) -> SchemaPlan:
    augmented_request = (
        f"{user_request}\n\n"
        "Before writing JSON, identify every FK relationship:\n"
        "1. Which tables are children of another table? Add a FK column for each.\n"
        "2. Which tables are junction/bridge tables linking TWO entities? Add a FK column for EACH of the two entities.\n"
        "Every FK column must have \"references\": \"other_table.id\" — never null.\n"
        "Now output the JSON."
    )
    raw = ollama_chat_json(system=SCHEMA_SYSTEM_PROMPT, user=augmented_request, timeout_s=timeout_s)
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

