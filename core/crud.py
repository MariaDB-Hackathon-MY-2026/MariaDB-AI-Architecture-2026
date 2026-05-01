"""CRUD helpers for Streamlit forms (parameterized queries only)."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from core.db_executor import get_connection

_SAFE_IDENT = re.compile(r"^[A-Za-z0-9_]+$")


def _assert_safe_ident(value: str, *, label: str) -> str:
    v = (value or "").strip()
    if not v:
        raise ValueError(f"{label} is required")
    if not _SAFE_IDENT.match(v):
        raise ValueError(f"{label} must match {_SAFE_IDENT.pattern}: {value!r}")
    return v


@dataclass(frozen=True)
class QueryResult:
    columns: list[str]
    rows: list[tuple[Any, ...]]


def fetch_all(*, sql: str, params: tuple[Any, ...] = ()) -> list[tuple[Any, ...]]:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        return list(cur.fetchall())
    finally:
        conn.close()


def fetch_query(*, sql: str, params: tuple[Any, ...] = ()) -> QueryResult:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        rows = list(cur.fetchall())
        cols = [d[0] for d in (cur.description or [])]
        return QueryResult(columns=cols, rows=rows)
    finally:
        conn.close()


def fetch_table(*, table: str, limit: int = 50) -> QueryResult:
    conn = get_connection()
    try:
        cur = conn.cursor()
        tbl = _assert_safe_ident(table, label="Table")
        cur.execute(f"SELECT * FROM `{tbl}` LIMIT {int(limit)}")
        rows = list(cur.fetchall())
        cols = [d[0] for d in (cur.description or [])]
        return QueryResult(columns=cols, rows=rows)
    finally:
        conn.close()


def fetch_table_page(
    *,
    table: str,
    columns: list[str] | None = None,
    where_sql: str = "",
    where_params: tuple[Any, ...] = (),
    order_by: str | None = None,
    order_dir: str = "ASC",
    limit: int = 50,
    offset: int = 0,
) -> QueryResult:
    """Fetch a page of rows with optional WHERE/ORDER BY.

    Caller must provide safe column names (from INFORMATION_SCHEMA).
    """
    tbl = _assert_safe_ident(table, label="Table")
    cols = columns or ["*"]
    if cols != ["*"]:
        cols = [_assert_safe_ident(c, label="Column") for c in cols]
    select_sql = "*" if cols == ["*"] else ", ".join(f"`{c}`" for c in cols)

    sql = f"SELECT {select_sql} FROM `{tbl}`"
    if where_sql.strip():
        sql += f" WHERE {where_sql.strip()}"
    if order_by:
        ob = _assert_safe_ident(order_by, label="Order by")
        direction = "DESC" if order_dir.strip().upper() == "DESC" else "ASC"
        sql += f" ORDER BY `{ob}` {direction}"
    sql += f" LIMIT {int(limit)} OFFSET {int(offset)}"
    return fetch_query(sql=sql, params=where_params)


def count_rows(*, table: str, where_sql: str = "", where_params: tuple[Any, ...] = ()) -> int:
    tbl = _assert_safe_ident(table, label="Table")
    sql = f"SELECT COUNT(*) FROM `{tbl}`"
    if where_sql.strip():
        sql += f" WHERE {where_sql.strip()}"
    rows = fetch_all(sql=sql, params=where_params)
    return int(rows[0][0]) if rows else 0

def fetch_one_by_pk(*, table: str, pk_col: str, pk_value: Any) -> QueryResult:
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT * FROM `{table}` WHERE `{pk_col}` = ? LIMIT 1", (pk_value,))
        rows = list(cur.fetchall())
        cols = [d[0] for d in (cur.description or [])]
        return QueryResult(columns=cols, rows=rows)
    finally:
        conn.close()


def execute(*, sql: str, params: tuple[Any, ...] = ()) -> int:
    conn = get_connection()
    conn.autocommit = False
    try:
        cur = conn.cursor()
        cur.execute(sql, params)
        conn.commit()
        return cur.rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def insert_row(*, table: str, values: dict[str, Any]) -> int:
    cols = [c for c, v in values.items() if v is not None]
    if not cols:
        raise ValueError("No values to insert")
    placeholders = ", ".join(["?"] * len(cols))
    col_sql = ", ".join(f"`{c}`" for c in cols)
    sql = f"INSERT INTO `{table}` ({col_sql}) VALUES ({placeholders})"
    params = tuple(values[c] for c in cols)
    return execute(sql=sql, params=params)


def update_row(*, table: str, pk: dict[str, Any], values: dict[str, Any]) -> int:
    set_cols = [c for c, v in values.items() if v is not None and c not in pk]
    if not set_cols:
        raise ValueError("No values to update")
    set_sql = ", ".join(f"`{c}` = ?" for c in set_cols)
    where_cols = list(pk.keys())
    where_sql = " AND ".join(f"`{c}` = ?" for c in where_cols)
    sql = f"UPDATE `{table}` SET {set_sql} WHERE {where_sql}"
    params = tuple(values[c] for c in set_cols) + tuple(pk[c] for c in where_cols)
    return execute(sql=sql, params=params)


def delete_row(*, table: str, pk: dict[str, Any]) -> int:
    where_cols = list(pk.keys())
    if not where_cols:
        raise ValueError("Missing primary key")
    where_sql = " AND ".join(f"`{c}` = ?" for c in where_cols)
    sql = f"DELETE FROM `{table}` WHERE {where_sql}"
    params = tuple(pk[c] for c in where_cols)
    return execute(sql=sql, params=params)

