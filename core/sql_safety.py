"""Very small SQL safety checks before execution.

We don't try to parse SQL fully; we enforce a conservative allowlist.
"""

from __future__ import annotations

import re

_DISALLOWED = re.compile(
    r"\b("
    r"GRANT|REVOKE|CREATE\s+USER|DROP\s+USER|ALTER\s+USER|"
    r"CREATE\s+DATABASE|DROP\s+DATABASE|"
    r"TRUNCATE"
    r")\b",
    re.IGNORECASE,
)

_ALLOWED_START = re.compile(
    r"^\s*(CREATE\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX|ALTER\s+TABLE"
    r"|DROP\s+TABLE(\s+IF\s+EXISTS)?"
    r"|SET\s+FOREIGN_KEY_CHECKS)\b",
    re.IGNORECASE,
)


def assert_statement_is_safe(statement: str) -> None:
    stmt = statement.strip().rstrip(";").strip()
    if not stmt:
        raise ValueError("Empty SQL statement")
    if _DISALLOWED.search(stmt):
        raise ValueError(f"Statement contains a disallowed operation: {stmt[:120]}")
    if not _ALLOWED_START.match(stmt):
        raise ValueError(f"Only CREATE TABLE / CREATE INDEX / ALTER TABLE statements are allowed: {stmt[:120]}")

