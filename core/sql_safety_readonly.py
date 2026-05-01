"""Safety checks for read-only SQL queries (NL Query Assistant).

We allow SELECT/CTE-only queries. We reject any write/DDL keywords.
This is intentionally conservative.
"""

from __future__ import annotations

import re

_DISALLOWED = re.compile(
    r"\b("
    r"INSERT|UPDATE|DELETE|REPLACE|MERGE|UPSERT|"
    r"CREATE|ALTER|DROP|TRUNCATE|RENAME|"
    r"GRANT|REVOKE|"
    r"CALL|DO|"
    r"LOAD\s+DATA"
    r")\b",
    re.IGNORECASE,
)

_ALLOWED_START = re.compile(r"^\s*(WITH\b[\s\S]+?\bSELECT\b|SELECT)\b", re.IGNORECASE)


def assert_readonly_select(sql: str) -> None:
    stmt = sql.strip().rstrip(";").strip()
    if not stmt:
        raise ValueError("Empty SQL query")
    if _DISALLOWED.search(stmt):
        raise ValueError("Query contains a disallowed operation (read-only mode)")
    if not _ALLOWED_START.match(stmt):
        raise ValueError("Only SELECT queries are allowed in read-only mode")

