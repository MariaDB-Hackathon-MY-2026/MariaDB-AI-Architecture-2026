"""Build safe ALTER TABLE statements from user edits (minimal MVP).

For now: add column only. We can extend to rename/modify later.
"""

from __future__ import annotations

import re

from core.schema_types import ColumnPlan

_SAFE_IDENT = re.compile(r"^[A-Za-z0-9_]+$")


def _assert_safe_ident(value: str, *, label: str) -> str:
    v = (value or "").strip()
    if not v:
        raise ValueError(f"{label} is required")
    if not _SAFE_IDENT.match(v):
        raise ValueError(f"{label} must match {_SAFE_IDENT.pattern}: {value!r}")
    return v


def build_add_column_statement(*, table_name: str, column: ColumnPlan) -> str:
    parts: list[str] = [f"ALTER TABLE `{table_name}` ADD COLUMN `{column.name}`", column.sql_type]
    parts.append("NULL" if column.is_nullable else "NOT NULL")
    if column.default is not None:
        parts.append(f"DEFAULT {column.default}")
    return " ".join(parts)


def build_modify_column_statement(*, table_name: str, column: ColumnPlan) -> str:
    parts: list[str] = [f"ALTER TABLE `{table_name}` MODIFY COLUMN `{column.name}`", column.sql_type]
    parts.append("NULL" if column.is_nullable else "NOT NULL")
    if column.default is not None:
        parts.append(f"DEFAULT {column.default}")
    return " ".join(parts)


def build_rename_column_statement(
    *,
    table_name: str,
    old_name: str,
    new_column: ColumnPlan,
) -> str:
    # MariaDB supports CHANGE COLUMN old new type ...
    parts: list[str] = [
        f"ALTER TABLE `{table_name}` CHANGE COLUMN `{old_name}` `{new_column.name}`",
        new_column.sql_type,
    ]
    parts.append("NULL" if new_column.is_nullable else "NOT NULL")
    if new_column.default is not None:
        parts.append(f"DEFAULT {new_column.default}")
    return " ".join(parts)


def build_drop_column_statement(*, table_name: str, column_name: str) -> str:
    col = _assert_safe_ident(column_name, label="Column name")
    return f"ALTER TABLE `{table_name}` DROP COLUMN `{col}`"


def build_rename_table_statement(*, old_table_name: str, new_table_name: str) -> str:
    old = _assert_safe_ident(old_table_name, label="Old table name")
    new = _assert_safe_ident(new_table_name, label="New table name")
    return f"ALTER TABLE `{old}` RENAME TO `{new}`"


def build_create_index_statement(
    *,
    table_name: str,
    index_name: str,
    columns: list[str],
    is_unique: bool,
) -> str:
    table = _assert_safe_ident(table_name, label="Table name")
    idx = _assert_safe_ident(index_name, label="Index name")
    cols = [_assert_safe_ident(c, label="Column name") for c in (columns or [])]
    if not cols:
        raise ValueError("At least one column is required")
    unique = "UNIQUE " if is_unique else ""
    cols_sql = ", ".join(f"`{c}`" for c in cols)
    return f"CREATE {unique}INDEX `{idx}` ON `{table}` ({cols_sql})"


def build_drop_index_statement(*, table_name: str, index_name: str) -> str:
    table = _assert_safe_ident(table_name, label="Table name")
    idx = _assert_safe_ident(index_name, label="Index name")
    if idx.upper() == "PRIMARY":
        raise ValueError("Cannot drop PRIMARY index here (use DROP PRIMARY KEY migration).")
    # Use ALTER TABLE ... DROP INDEX so it passes our SQL safety allowlist.
    return f"ALTER TABLE `{table}` DROP INDEX `{idx}`"

