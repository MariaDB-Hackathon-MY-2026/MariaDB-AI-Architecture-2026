"""Schema plan types used between LLM → SQL builder.

We keep this JSON-serializable and conservative for safety.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ColumnPlan:
    name: str
    sql_type: str
    is_nullable: bool
    is_primary_key: bool = False
    is_auto_increment: bool = False
    default: str | None = None
    references: str | None = None  # "table.column"


@dataclass(frozen=True)
class TablePlan:
    name: str
    columns: list[ColumnPlan]
    unique_indexes: list[list[str]]
    indexes: list[list[str]]


@dataclass(frozen=True)
class SchemaPlan:
    database_name: str | None
    tables: list[TablePlan]


def expect_str(obj: Any, label: str) -> str:
    if not isinstance(obj, str) or not obj.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return obj.strip()


def expect_bool(obj: Any, label: str) -> bool:
    if not isinstance(obj, bool):
        raise ValueError(f"{label} must be a boolean")
    return obj


def expect_list(obj: Any, label: str) -> list[Any]:
    if not isinstance(obj, list):
        raise ValueError(f"{label} must be a list")
    return obj

