"""Build safe MariaDB DDL from a SchemaPlan."""

from __future__ import annotations

from collections import defaultdict, deque

from core.schema_types import ColumnPlan, SchemaPlan, TablePlan


def build_create_statements(plan: SchemaPlan) -> list[str]:
    ordered_tables = _toposort_tables(plan.tables)

    stmts: list[str] = []
    for table in ordered_tables:
        stmts.append(_create_table_sql(table))
        stmts.extend(_create_indexes_sql(table))
    return stmts


def _create_table_sql(table: TablePlan) -> str:
    column_lines: list[str] = []
    pk_cols: list[str] = []
    fk_lines: list[str] = []

    for col in table.columns:
        column_lines.append(_column_sql(col))
        if col.is_primary_key:
            pk_cols.append(col.name)
        if col.references:
            ref_table, ref_col = col.references.split(".", 1)
            fk_name = f"fk_{table.name}_{col.name}"
            fk_lines.append(
                f"  CONSTRAINT `{fk_name}` FOREIGN KEY (`{col.name}`) "
                f"REFERENCES `{ref_table}` (`{ref_col}`)"
            )

    constraints: list[str] = []
    if pk_cols:
        joined = ", ".join(f"`{c}`" for c in pk_cols)
        constraints.append(f"  PRIMARY KEY ({joined})")
    constraints.extend(fk_lines)

    all_lines = [f"  {line}" for line in column_lines]
    all_lines.extend(constraints)

    body = ",\n".join(all_lines)
    return f"CREATE TABLE IF NOT EXISTS `{table.name}` (\n{body}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"


def _column_sql(col: ColumnPlan) -> str:
    parts: list[str] = [f"`{col.name}`", col.sql_type]
    parts.append("NULL" if col.is_nullable else "NOT NULL")
    if col.is_auto_increment:
        parts.append("AUTO_INCREMENT")
    if col.default is not None:
        parts.append(f"DEFAULT {col.default}")
    return " ".join(parts)


def _create_indexes_sql(table: TablePlan) -> list[str]:
    stmts: list[str] = []
    for cols in table.unique_indexes:
        name = f"ux_{table.name}_{'_'.join(cols)}"
        joined = ", ".join(f"`{c}`" for c in cols)
        stmts.append(f"CREATE UNIQUE INDEX `{name}` ON `{table.name}` ({joined})")
    for cols in table.indexes:
        name = f"ix_{table.name}_{'_'.join(cols)}"
        joined = ", ".join(f"`{c}`" for c in cols)
        stmts.append(f"CREATE INDEX `{name}` ON `{table.name}` ({joined})")
    return stmts


def _toposort_tables(tables: list[TablePlan]) -> list[TablePlan]:
    by_name = {t.name: t for t in tables}
    deps: dict[str, set[str]] = {t.name: set() for t in tables}
    reverse: dict[str, set[str]] = {t.name: set() for t in tables}

    for t in tables:
        for c in t.columns:
            if not c.references:
                continue
            ref_table, _ = c.references.split(".", 1)
            if ref_table not in by_name:
                # external reference; ignore ordering
                continue
            deps[t.name].add(ref_table)
            reverse[ref_table].add(t.name)

    queue = deque([name for name, d in deps.items() if not d])
    ordered_names: list[str] = []
    while queue:
        name = queue.popleft()
        ordered_names.append(name)
        for child in reverse[name]:
            deps[child].discard(name)
            if not deps[child]:
                queue.append(child)

    if len(ordered_names) != len(tables):
        # Cycle exists; fall back to original order.
        return tables
    return [by_name[n] for n in ordered_names]

