"""Table maintenance operations (user-initiated, safety-guarded).

Important: resequencing primary keys can break foreign keys. We only allow
"rebuild sequential IDs" for tables with NO foreign keys in or out.
"""

from __future__ import annotations

from collections import deque

from core.db_executor import get_connection
from core.introspect import list_foreign_keys, list_tables


def reseed_auto_increment(*, table_name: str, next_value: int) -> None:
    if next_value < 1:
        raise ValueError("next_value must be >= 1")
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"ALTER TABLE `{table_name}` AUTO_INCREMENT = {int(next_value)}")
        conn.commit()
    finally:
        conn.close()


def compute_next_auto_increment(*, table_name: str, pk_col: str) -> int:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT MAX(`{pk_col}`) FROM `{table_name}`")
        row = cur.fetchone()
        max_id = row[0] if row else None
        if max_id is None:
            return 1
        return int(max_id) + 1
    finally:
        conn.close()


def truncate_table(*, table_name: str, disable_fk_checks: bool = False) -> None:
    """Delete all rows and reset AUTO_INCREMENT.

    If disable_fk_checks is True, temporarily disables FK checks for this session.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        cur.execute(f"TRUNCATE TABLE `{table_name}`")
        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
    finally:
        conn.close()


def rebuild_sequential_ids(*, table_name: str, pk_col: str) -> None:
    """Rebuild table so PK becomes 1..N (DANGEROUS; only safe with no FKs).

    Implementation: create a new table, copy rows ordered by pk,
    drop old table, rename new.
    """
    conn = get_connection()
    try:
        cur = conn.cursor()
        tmp = f"__tmp_rebuild_{table_name}"

        cur.execute(f"DROP TABLE IF EXISTS `{tmp}`")
        cur.execute(f"CREATE TABLE `{tmp}` LIKE `{table_name}`")

        # Copy all non-PK columns; let auto_increment generate new IDs.
        cur.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = ?
            ORDER BY ordinal_position
            """,
            (table_name,),
        )
        cols = [r[0] for r in cur.fetchall()]
        non_pk = [c for c in cols if c != pk_col]
        if not non_pk:
            # Table only has PK column.
            cur.execute(f"INSERT INTO `{tmp}` () VALUES ()")
        else:
            col_sql = ", ".join(f"`{c}`" for c in non_pk)
            cur.execute(
                f"INSERT INTO `{tmp}` ({col_sql}) SELECT {col_sql} FROM `{table_name}` ORDER BY `{pk_col}`"
            )

        cur.execute(f"DROP TABLE `{table_name}`")
        cur.execute(f"RENAME TABLE `{tmp}` TO `{table_name}`")
        conn.commit()
    finally:
        conn.close()


def compute_truncate_order() -> list[str]:
    """Return child->parent truncate order based on FK graph."""
    tables = list_tables()
    fks = list_foreign_keys()

    # parent -> children edges
    children_by_parent: dict[str, set[str]] = {t: set() for t in tables}
    parents_by_child: dict[str, set[str]] = {t: set() for t in tables}

    for fk in fks:
        child = fk.table_name
        parent = fk.referenced_table_name
        if child not in parents_by_child or parent not in children_by_parent:
            continue
        parents_by_child[child].add(parent)
        children_by_parent[parent].add(child)

    # topological order parents first
    indeg = {t: len(parents_by_child[t]) for t in tables}
    q: deque[str] = deque([t for t, d in indeg.items() if d == 0])
    ordered_parents_first: list[str] = []
    while q:
        n = q.popleft()
        ordered_parents_first.append(n)
        for child in children_by_parent[n]:
            indeg[child] -= 1
            if indeg[child] == 0:
                q.append(child)

    if len(ordered_parents_first) != len(tables):
        # cycle; fall back to simple reverse alphabetical to at least be deterministic
        return sorted(tables, reverse=True)

    # truncate needs children first
    return list(reversed(ordered_parents_first))


def reset_all_tables(*, disable_fk_checks: bool = False) -> list[str]:
    """TRUNCATE all tables in safe order. Returns the order used."""
    order = [t for t in compute_truncate_order() if not t.startswith("app_")]
    conn = get_connection()
    try:
        cur = conn.cursor()
        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")
        for t in order:
            cur.execute(f"TRUNCATE TABLE `{t}`")
        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
        return order
    finally:
        conn.close()

