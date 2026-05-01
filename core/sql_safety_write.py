"""Safety checks for AI-generated DML (INSERT/UPDATE/DELETE) statements."""

from __future__ import annotations

import re

_DISALLOWED = re.compile(
    r"\b("
    r"DROP|TRUNCATE|CREATE|ALTER|RENAME|"
    r"GRANT|REVOKE|"
    r"CALL|DO|"
    r"LOAD\s+DATA|"
    r"INTO\s+OUTFILE|INTO\s+DUMPFILE"
    r")\b",
    re.IGNORECASE,
)

_ALLOWED_START = re.compile(r"^\s*(INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM)", re.IGNORECASE)


def assert_write_dml(sql: str) -> None:
    stmt = sql.strip().rstrip(";").strip()
    if not stmt:
        raise ValueError("Empty SQL statement")
    if _DISALLOWED.search(stmt):
        raise ValueError(f"Statement contains a disallowed operation: {stmt[:120]}")
    if not _ALLOWED_START.match(stmt):
        raise ValueError(
            f"Only INSERT INTO / UPDATE / DELETE FROM statements are allowed here: {stmt[:120]}"
        )
