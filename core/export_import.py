"""Export/import helpers (CSV + schema SQL)."""

from __future__ import annotations

import csv
import decimal
import io
from dataclasses import dataclass
from datetime import date, datetime, time as dt_time
from typing import Any

from core.crud import QueryResult, fetch_query
from core.db_executor import get_connection
from core.introspect import list_tables


def query_result_to_csv_bytes(result: QueryResult) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(result.columns)
    for row in result.rows:
        writer.writerow(list(row))
    return buf.getvalue().encode("utf-8")


def export_table_csv_bytes(*, table_name: str, limit: int = 50000) -> bytes:
    result = fetch_query(sql=f"SELECT * FROM `{table_name}` LIMIT {int(limit)}")
    return query_result_to_csv_bytes(result)


def dump_schema_sql() -> str:
    """Return a SQL script (CREATE TABLE + indexes) for current database."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        parts: list[str] = []
        for t in list_tables():
            cur.execute(f"SHOW CREATE TABLE `{t}`")
            row = cur.fetchone()
            if not row:
                continue
            create_sql = row[1]
            parts.append(create_sql + ";\n")
        return "\n".join(parts)
    finally:
        conn.close()


def _sql_literal(v: Any) -> str:
    """Format a Python value as a safe SQL string literal for INSERT statements."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, (int, float, decimal.Decimal)):
        return str(v)
    if isinstance(v, datetime):
        return f"'{v.strftime('%Y-%m-%d %H:%M:%S')}'"
    if isinstance(v, date):
        return f"'{v.strftime('%Y-%m-%d')}'"
    if isinstance(v, dt_time):
        return f"'{v.strftime('%H:%M:%S')}'"
    if isinstance(v, (bytes, bytearray)):
        return "0x" + v.hex()
    s = str(v).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{s}'"


@dataclass(frozen=True)
class FullDumpResult:
    sql: str
    table_count: int
    row_count: int


def dump_full_sql(*, row_limit: int = 100_000) -> FullDumpResult:
    """Return a mysqldump-style SQL script: DDL (SHOW CREATE TABLE) + INSERT data.

    Tables are wrapped in SET FOREIGN_KEY_CHECKS = 0/1 so the file can be
    restored in any order without FK violations.
    """
    from utils.audit_log import now_iso

    conn = get_connection()
    try:
        cur = conn.cursor()
        tables = list_tables()
        lines: list[str] = []
        total_rows = 0

        lines.append("-- MariaDB AI Architect — Full Database Export")
        lines.append(f"-- Generated : {now_iso()}")
        lines.append(f"-- Tables    : {len(tables)}")
        lines.append("")
        lines.append("SET FOREIGN_KEY_CHECKS = 0;")
        lines.append("SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';")
        lines.append("SET NAMES utf8mb4;")
        lines.append("")

        for table in tables:
            sep = "-- " + "-" * 56
            lines.append(sep)
            lines.append(f"-- Table: `{table}`")
            lines.append(sep)
            lines.append("")

            # DDL
            lines.append(f"DROP TABLE IF EXISTS `{table}`;")
            cur.execute(f"SHOW CREATE TABLE `{table}`")
            ddl_row = cur.fetchone()
            if ddl_row:
                lines.append(ddl_row[1] + ";")
            lines.append("")

            # Data
            cur.execute(f"SELECT COUNT(*) FROM `{table}`")
            count = (cur.fetchone() or (0,))[0]
            if count > 0:
                lines.append(f"-- Data for `{table}` ({count} rows)")
                cur.execute(f"SELECT * FROM `{table}` LIMIT {int(row_limit)}")
                col_names = [d[0] for d in cur.description]
                col_list = ", ".join(f"`{c}`" for c in col_names)
                data_rows = cur.fetchall()
                for data_row in data_rows:
                    vals = ", ".join(_sql_literal(cell) for cell in data_row)
                    lines.append(f"INSERT INTO `{table}` ({col_list}) VALUES ({vals});")
                total_rows += len(data_rows)
                lines.append("")

        lines.append("SET FOREIGN_KEY_CHECKS = 1;")
        lines.append("")
        lines.append(f"-- End of export — {len(tables)} table(s), {total_rows} row(s)")

        return FullDumpResult(
            sql="\n".join(lines),
            table_count=len(tables),
            row_count=total_rows,
        )
    finally:
        conn.close()


@dataclass(frozen=True)
class CsvImportResult:
    inserted_rows: int


def sniff_csv_header(*, csv_bytes: bytes, delimiter: str = ",") -> list[str]:
    text = csv_bytes.decode("utf-8", errors="replace")
    buf = io.StringIO(text)
    reader = csv.reader(buf, delimiter=delimiter)
    try:
        first = next(iter(reader))
    except StopIteration:
        raise ValueError("CSV is empty")
    return [c.strip() for c in first]


def import_csv_to_table(
    *,
    table_name: str,
    csv_bytes: bytes,
    delimiter: str = ",",
    has_header: bool = True,
    max_rows: int | None = None,
) -> CsvImportResult:
    """Import CSV into a table.

    CSV header must match table column names (subset allowed).
    """
    text = csv_bytes.decode("utf-8", errors="replace")
    buf = io.StringIO(text)
    reader = csv.reader(buf, delimiter=delimiter)

    rows_iter = iter(reader)
    try:
        first = next(rows_iter)
    except StopIteration:
        raise ValueError("CSV is empty")

    if has_header:
        columns = [c.strip() for c in first if c.strip()]
        if not columns:
            raise ValueError("CSV header has no columns")
    else:
        raise ValueError("CSV without header is not supported yet (needs column mapping UI).")

    placeholders = ", ".join(["?"] * len(columns))
    col_sql = ", ".join(f"`{c}`" for c in columns)
    sql = f"INSERT INTO `{table_name}` ({col_sql}) VALUES ({placeholders})"

    batch: list[tuple[Any, ...]] = []
    inserted = 0

    conn = get_connection()
    conn.autocommit = False
    try:
        cur = conn.cursor()
        for i, row in enumerate(rows_iter, start=1):
            if max_rows is not None and inserted >= max_rows:
                break
            # pad/truncate to match columns
            values = row[: len(columns)]
            if len(values) < len(columns):
                values = values + [""] * (len(columns) - len(values))
            # convert empty strings to None
            vals = tuple(None if (v is None or str(v).strip() == "") else v for v in values)
            batch.append(vals)
            if len(batch) >= 1000:
                cur.executemany(sql, batch)
                inserted += cur.rowcount
                batch = []
        if batch:
            cur.executemany(sql, batch)
            inserted += cur.rowcount
        conn.commit()
        return CsvImportResult(inserted_rows=inserted)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def import_csv_to_table_mapped(
    *,
    table_name: str,
    csv_bytes: bytes,
    delimiter: str = ",",
    max_rows: int | None = None,
    mapping: dict[str, str],
) -> CsvImportResult:
    """Import CSV using explicit column mapping.

    `mapping` is {target_table_column: source_csv_column}.
    CSV must have a header row.
    """
    if not mapping:
        raise ValueError("Mapping is required")
    text = csv_bytes.decode("utf-8", errors="replace")
    buf = io.StringIO(text)
    reader = csv.reader(buf, delimiter=delimiter)

    rows_iter = iter(reader)
    try:
        header = next(rows_iter)
    except StopIteration:
        raise ValueError("CSV is empty")
    csv_cols = [c.strip() for c in header]
    if not csv_cols:
        raise ValueError("CSV header has no columns")

    idx_by_csv = {c: i for i, c in enumerate(csv_cols) if c}
    target_cols = [t.strip() for t in mapping.keys() if t.strip()]
    if not target_cols:
        raise ValueError("No target columns selected")

    source_idxs: list[int] = []
    for t in target_cols:
        src = mapping.get(t)
        if not src or src not in idx_by_csv:
            raise ValueError(f"Missing CSV column for target '{t}': {src!r}")
        source_idxs.append(idx_by_csv[src])

    placeholders = ", ".join(["?"] * len(target_cols))
    col_sql = ", ".join(f"`{c}`" for c in target_cols)
    sql = f"INSERT INTO `{table_name}` ({col_sql}) VALUES ({placeholders})"

    batch: list[tuple[Any, ...]] = []
    inserted = 0

    conn = get_connection()
    conn.autocommit = False
    try:
        cur = conn.cursor()
        for _, row in enumerate(rows_iter, start=1):
            if max_rows is not None and inserted >= max_rows:
                break
            values: list[Any] = []
            for idx in source_idxs:
                v = row[idx] if idx < len(row) else ""
                values.append(None if (v is None or str(v).strip() == "") else v)
            batch.append(tuple(values))
            if len(batch) >= 1000:
                cur.executemany(sql, batch)
                inserted += cur.rowcount
                batch = []
        if batch:
            cur.executemany(sql, batch)
            inserted += cur.rowcount
        conn.commit()
        return CsvImportResult(inserted_rows=inserted)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

