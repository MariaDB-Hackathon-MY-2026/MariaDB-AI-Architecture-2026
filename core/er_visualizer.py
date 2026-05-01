"""Generate Mermaid diagrams from INFORMATION_SCHEMA metadata.

Two flavors:
- ER (`erDiagram`) for database-accurate notation
- Flowchart (`flowchart LR`) for presentation-friendly boxes/arrows
"""

from __future__ import annotations

from collections import defaultdict, deque

from core.introspect import (
    list_columns,
    list_foreign_key_constraints,
    list_primary_key_columns,
    list_tables,
)


def build_mermaid_er_diagram(
    *,
    label_columns_per_table: int = 3,
    focus_table: str | None = None,
    focus_tables: list[str] | None = None,
    depth: int = 1,
) -> str:
    """Return Mermaid ER diagram text (Level 3: PK + FK + label columns)."""
    tables = list_tables()
    fks = list_foreign_key_constraints()
    cols = list_columns()

    cols_by_table: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for c in cols:
        cols_by_table[c.table_name].append((c.column_name, c.column_type))

    fk_cols_by_table: dict[str, set[str]] = defaultdict(set)
    for fk in fks:
        fk_cols_by_table[fk.table_name].add(fk.column_name)

    tables_set = set(tables)
    focus_values = [v for v in (focus_tables or []) if (v or "").strip()]
    if focus_table and not focus_values:
        focus_values = [focus_table]

    if focus_values:
        resolved: list[str] = []
        for v in focus_values:
            r = _resolve_table_name(v, tables)
            if r is None:
                raise ValueError(f"Unknown table: {v!r}")
            resolved.append(r)

        allowed_tables = set(resolved)
        for r in resolved:
            allowed_tables |= _related_tables(r, fks, depth=depth) | {r}
    else:
        allowed_tables = tables_set

    # Mermaid ER syntax:
    # erDiagram
    #   A ||--o{ B : "rel"
    lines: list[str] = ["erDiagram"]

    def _mermaid_type(sql_column_type: str) -> str:
        t = (sql_column_type or "").lower()
        if t.startswith(("tinyint", "smallint", "mediumint", "int", "bigint")):
            return "INT"
        if t.startswith(("decimal", "numeric", "float", "double")):
            return "DECIMAL"
        if t.startswith("varchar") or t.startswith("char"):
            return "VARCHAR"
        if "text" in t:
            return "TEXT"
        if t.startswith("date"):
            return "DATE"
        if t.startswith(("datetime", "timestamp")):
            return "DATETIME"
        if t.startswith("bool") or t.startswith("boolean"):
            return "BOOLEAN"
        return "STRING"

    def _pick_label_cols(table: str, pk_cols: list[str], fk_cols: set[str]) -> list[str]:
        # Prefer common "name-ish" columns for demos.
        candidates = [c for (c, _) in cols_by_table.get(table, []) if c not in set(pk_cols) | set(fk_cols)]
        preferred = ["name", "title", "code", "iata", "icao", "email", "city", "country", "status"]
        picked: list[str] = []
        for p in preferred:
            if p in candidates:
                picked.append(p)
            if len(picked) >= label_columns_per_table:
                return picked
        for c in candidates:
            if c in picked:
                continue
            picked.append(c)
            if len(picked) >= label_columns_per_table:
                break
        return picked

    # Define entities (PK + FK + label cols)
    for t in tables:
        if t not in allowed_tables:
            continue
        pk_cols = list_primary_key_columns(table_name=t)
        fk_cols = fk_cols_by_table.get(t, set())
        label_cols = _pick_label_cols(t, pk_cols, fk_cols)

        lines.append(f"  {t} {{")
        table_cols = cols_by_table.get(t, [])
        type_by_col = {name: col_type for (name, col_type) in table_cols}

        for pk in pk_cols:
            lines.append(f"    {_mermaid_type(type_by_col.get(pk, 'int'))} {pk} PK")

        for fk_col in sorted(fk_cols):
            lines.append(f"    {_mermaid_type(type_by_col.get(fk_col, 'int'))} {fk_col} FK")

        for c in label_cols:
            lines.append(f"    {_mermaid_type(type_by_col.get(c, 'varchar'))} {c}")
        lines.append("  }")

    for fk in fks:
        if fk.table_name not in allowed_tables or fk.referenced_table_name not in allowed_tables:
            continue
        # child -> parent, many child rows to one parent row (typical)
        rel = _relationship_label(parent_table=fk.referenced_table_name, child_table=fk.table_name, fk_column=fk.column_name)
        lines.append(f"  {fk.referenced_table_name} ||--o{{ {fk.table_name} : \"{rel}\"")

    return "\n".join(lines)


def _resolve_table_name(user_value: str, tables: list[str]) -> str | None:
    v = user_value.strip().lower()
    if not v:
        return None
    exact = next((t for t in tables if t.lower() == v), None)
    if exact:
        return exact
    # singular/plural heuristic
    if v.endswith("s"):
        v2 = v[:-1]
    else:
        v2 = v + "s"
    return next((t for t in tables if t.lower() == v2), None)


def _related_tables(focus: str, fks, *, depth: int) -> set[str]:
    # undirected adjacency by FK
    adj: dict[str, set[str]] = defaultdict(set)
    for fk in fks:
        a = fk.table_name
        b = fk.referenced_table_name
        adj[a].add(b)
        adj[b].add(a)

    seen = {focus}
    q = deque([(focus, 0)])
    while q:
        node, d = q.popleft()
        if d >= depth:
            continue
        for nb in adj.get(node, set()):
            if nb in seen:
                continue
            seen.add(nb)
            q.append((nb, d + 1))
    seen.discard(focus)
    return seen


def _relationship_label(*, parent_table: str, child_table: str, fk_column: str) -> str:
    """Heuristic labels for nicer ER diagrams."""
    c = child_table.lower()
    p = parent_table.lower()
    fk = fk_column.lower()

    # Common join tables
    if c in {"enrollment", "enrollments"}:
        if "student" in fk:
            return "enrolls"
        if "course" in fk or "class" in fk:
            return "has enrollments"
        return "enrollment"

    if c in {"routes"}:
        if "source" in fk:
            return "source"
        if "destination" in fk or "dest" in fk:
            return "destination"
        if "airline" in fk:
            return "operated by"
        return "route"

    # Generic: use fk column name without _id
    if fk.endswith("_id"):
        fk = fk[: -len("_id")]
    fk = fk.replace("_", " ").strip()

    # If fk matches parent table, use a generic verb
    if fk == p or fk == p.rstrip("s"):
        return "has"
    return fk or "rel"

