"""Read live schema metadata from MariaDB for UI verification."""

from __future__ import annotations

from dataclasses import dataclass

from core.db_executor import get_connection


@dataclass(frozen=True)
class ColumnInfo:
    table_name: str
    column_name: str
    column_type: str
    is_nullable: bool
    column_key: str
    extra: str


@dataclass(frozen=True)
class ForeignKeyInfo:
    table_name: str
    column_name: str
    referenced_table_name: str
    referenced_column_name: str


@dataclass(frozen=True)
class ForeignKeyConstraintInfo:
    constraint_name: str
    table_name: str
    column_name: str
    referenced_table_name: str
    referenced_column_name: str
    update_rule: str
    delete_rule: str


@dataclass(frozen=True)
class AutoIncrementPkInfo:
    pk_column: str
    column_type: str


@dataclass(frozen=True)
class IndexInfo:
    table_name: str
    index_name: str
    is_unique: bool
    columns: tuple[str, ...]


def list_tables() -> list[str]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
            """
        )
        return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def list_columns() -> list[ColumnInfo]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
              table_name,
              column_name,
              column_type,
              is_nullable,
              column_key,
              extra
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
            ORDER BY table_name, ordinal_position
            """
        )
        rows = cur.fetchall()
        return [
            ColumnInfo(
                table_name=r[0],
                column_name=r[1],
                column_type=r[2],
                is_nullable=(r[3] == "YES"),
                column_key=r[4] or "",
                extra=r[5] or "",
            )
            for r in rows
        ]
    finally:
        conn.close()


def list_primary_key_columns(*, table_name: str) -> list[str]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT k.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage k
              ON k.constraint_name = tc.constraint_name
             AND k.table_schema = tc.table_schema
             AND k.table_name = tc.table_name
            WHERE tc.table_schema = DATABASE()
              AND tc.table_name = ?
              AND tc.constraint_type = 'PRIMARY KEY'
            ORDER BY k.ordinal_position
            """,
            (table_name,),
        )
        return [r[0] for r in cur.fetchall()]
    finally:
        conn.close()


def list_foreign_keys(*, table_name: str | None = None) -> list[ForeignKeyInfo]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        if table_name:
            cur.execute(
                """
                SELECT
                  k.table_name,
                  k.column_name,
                  k.referenced_table_name,
                  k.referenced_column_name
                FROM information_schema.key_column_usage k
                WHERE k.table_schema = DATABASE()
                  AND k.referenced_table_name IS NOT NULL
                  AND k.table_name = ?
                ORDER BY k.table_name, k.column_name
                """,
                (table_name,),
            )
        else:
            cur.execute(
                """
                SELECT
                  k.table_name,
                  k.column_name,
                  k.referenced_table_name,
                  k.referenced_column_name
                FROM information_schema.key_column_usage k
                WHERE k.table_schema = DATABASE()
                  AND k.referenced_table_name IS NOT NULL
                ORDER BY k.table_name, k.column_name
                """
            )
        rows = cur.fetchall()
        return [
            ForeignKeyInfo(
                table_name=r[0],
                column_name=r[1],
                referenced_table_name=r[2],
                referenced_column_name=r[3],
            )
            for r in rows
        ]
    finally:
        conn.close()


def list_foreign_key_constraints(*, table_name: str | None = None) -> list[ForeignKeyConstraintInfo]:
    """Foreign keys including constraint name and ON UPDATE/DELETE rules."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        if table_name:
            cur.execute(
                """
                SELECT
                  k.constraint_name,
                  k.table_name,
                  k.column_name,
                  k.referenced_table_name,
                  k.referenced_column_name,
                  rc.update_rule,
                  rc.delete_rule
                FROM information_schema.key_column_usage k
                JOIN information_schema.referential_constraints rc
                  ON rc.constraint_schema = k.table_schema
                 AND rc.constraint_name = k.constraint_name
                WHERE k.table_schema = DATABASE()
                  AND k.referenced_table_name IS NOT NULL
                  AND k.table_name = ?
                ORDER BY k.table_name, k.column_name
                """,
                (table_name,),
            )
        else:
            cur.execute(
                """
                SELECT
                  k.constraint_name,
                  k.table_name,
                  k.column_name,
                  k.referenced_table_name,
                  k.referenced_column_name,
                  rc.update_rule,
                  rc.delete_rule
                FROM information_schema.key_column_usage k
                JOIN information_schema.referential_constraints rc
                  ON rc.constraint_schema = k.table_schema
                 AND rc.constraint_name = k.constraint_name
                WHERE k.table_schema = DATABASE()
                  AND k.referenced_table_name IS NOT NULL
                ORDER BY k.table_name, k.column_name
                """
            )
        rows = cur.fetchall()
        return [
            ForeignKeyConstraintInfo(
                constraint_name=r[0],
                table_name=r[1],
                column_name=r[2],
                referenced_table_name=r[3],
                referenced_column_name=r[4],
                update_rule=r[5],
                delete_rule=r[6],
            )
            for r in rows
        ]
    finally:
        conn.close()


def get_auto_increment_pk(*, table_name: str) -> AutoIncrementPkInfo | None:
    """Return the single-column auto-increment primary key info, if any."""
    pk_cols = list_primary_key_columns(table_name=table_name)
    if len(pk_cols) != 1:
        return None
    pk_col = pk_cols[0]
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT column_type, extra
            FROM information_schema.columns
            WHERE table_schema = DATABASE()
              AND table_name = ?
              AND column_name = ?
            """,
            (table_name, pk_col),
        )
        row = cur.fetchone()
        if not row:
            return None
        col_type, extra = row[0], (row[1] or "")
        if "auto_increment" not in extra.lower():
            return None
        return AutoIncrementPkInfo(pk_column=pk_col, column_type=col_type)
    finally:
        conn.close()


def count_inbound_foreign_keys(*, table_name: str) -> int:
    """How many FK columns in other tables reference this table."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT COUNT(*)
            FROM information_schema.key_column_usage k
            WHERE k.table_schema = DATABASE()
              AND k.referenced_table_name = ?
            """,
            (table_name,),
        )
        return int(cur.fetchone()[0])
    finally:
        conn.close()


def count_outbound_foreign_keys(*, table_name: str) -> int:
    """How many FK columns this table has pointing to others."""
    return len(list_foreign_keys(table_name=table_name))


def list_indexes(*, table_name: str | None = None) -> list[IndexInfo]:
    """List indexes for tables in current schema (grouped by index name)."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        if table_name:
            cur.execute(
                """
                SELECT table_name, index_name, non_unique, seq_in_index, column_name
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = ?
                ORDER BY table_name, index_name, seq_in_index
                """,
                (table_name,),
            )
        else:
            cur.execute(
                """
                SELECT table_name, index_name, non_unique, seq_in_index, column_name
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                ORDER BY table_name, index_name, seq_in_index
                """
            )
        rows = cur.fetchall()

        # group
        grouped: dict[tuple[str, str, int], list[tuple[int, str]]] = {}
        for t, idx, non_unique, seq, col in rows:
            key = (t, idx, int(non_unique))
            grouped.setdefault(key, []).append((int(seq), str(col)))

        out: list[IndexInfo] = []
        for (t, idx, non_unique), seq_cols in grouped.items():
            cols = tuple(c for _, c in sorted(seq_cols, key=lambda x: x[0]))
            out.append(IndexInfo(table_name=t, index_name=idx, is_unique=(non_unique == 0), columns=cols))
        out.sort(key=lambda i: (i.table_name, i.index_name))
        return out
    finally:
        conn.close()
