"""MariaDB connection and safe execution helpers (Phase 1)."""

from __future__ import annotations

import os
import re
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Generator, Iterable
import contextvars
from pathlib import Path

import mariadb
from dotenv import load_dotenv

_DOTENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_DOTENV_PATH, override=False)

_SAFE_IDENT = re.compile(r"^[a-zA-Z0-9_]+$")


def assert_safe_identifier(name: str, label: str) -> None:
    if not _SAFE_IDENT.match(name):
        raise ValueError(f"{label} must be alphanumeric or underscore only: {name!r}")


@dataclass(frozen=True)
class DbConfig:
    host: str
    port: int
    user: str
    password: str
    database: str

    @classmethod
    def from_env(cls) -> DbConfig:
        port_raw = os.getenv("MARIADB_PORT", "3306")
        try:
            port = int(port_raw)
        except ValueError as exc:
            raise ValueError("MARIADB_PORT must be an integer") from exc
        database = os.getenv("MARIADB_DATABASE", "mariadb_ai_architect")
        assert_safe_identifier(database, "MARIADB_DATABASE")
        return cls(
            host=os.getenv("MARIADB_HOST", "127.0.0.1"),
            port=port,
            user=os.getenv("MARIADB_USER", "root"),
            password=os.getenv("MARIADB_PASSWORD", "") or "",
            database=database,
        )


_RUNTIME_DB: contextvars.ContextVar[DbConfig | None] = contextvars.ContextVar("runtime_db_config", default=None)


def get_connection(*, database: str | None = None) -> mariadb.Connection:
    cfg = _RUNTIME_DB.get() or DbConfig.from_env()
    plugin_dir = (os.getenv("MARIADB_PLUGIN_DIR") or "").strip() or None
    try:
        return mariadb.connect(
            host=cfg.host,
            port=cfg.port,
            user=cfg.user,
            password=cfg.password,
            database=database if database is not None else cfg.database,
            plugin_dir=plugin_dir,
        )
    except Exception:
        raise


@contextmanager
def runtime_db_config(*, host: str, port: int, user: str, password: str, database: str) -> Generator[None, None, None]:
    token = _RUNTIME_DB.set(
        DbConfig(host=host, port=int(port), user=user, password=password or "", database=database)
    )
    try:
        yield
    finally:
        _RUNTIME_DB.reset(token)


def get_app_connection(*, database: str | None = None) -> mariadb.Connection:
    """Always connects using .env credentials — for querying app-level tables."""
    cfg = DbConfig.from_env()
    plugin_dir = (os.getenv("MARIADB_PLUGIN_DIR") or "").strip() or None
    return mariadb.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
        database=database if database is not None else cfg.database,
        plugin_dir=plugin_dir,
    )


def ping_database() -> tuple[bool, str]:
    """Return (ok, message). Respects runtime_db_config so test-db tests the actual draft."""
    try:
        cfg = _RUNTIME_DB.get() or DbConfig.from_env()
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        finally:
            conn.close()
        return True, f"Connected to {cfg.user}@{cfg.host}:{cfg.port}/{cfg.database}"
    except mariadb.Error as exc:
        return False, friendly_db_error(exc)


def friendly_db_error(exc: mariadb.Error) -> str:
    code = getattr(exc, "errno", None)
    if code == 1045:
        return "Could not connect — check username or password in your .env file."
    if code == 2002 or code == 2003:
        return "Could not reach MariaDB — is the server running and is MARIADB_HOST correct?"
    if code == 1049:
        return "Database does not exist yet — create it (see README) or fix MARIADB_DATABASE."
    return f"Database error: {exc}"


@contextmanager
def transaction() -> Generator[mariadb.Connection, None, None]:
    """
    Run work in a transaction (autocommit off).

    Note: some DDL statements may still implicit-commit depending on server version.
    Prefer validating SQL and ordering DDL (parents before children) for safety.
    """
    conn = get_connection()
    conn.autocommit = False
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def execute_script_statements(
    statements: Iterable[str],
    *,
    conn: mariadb.Connection | None = None,
) -> None:
    """Execute semicolon-separated DDL/DML statements using one connection."""
    own_conn = conn is None
    if own_conn:
        conn = get_connection()
        conn.autocommit = False
    try:
        cur = conn.cursor()
        for raw in statements:
            stmt = raw.strip()
            if not stmt:
                continue
            cur.execute(stmt)
        if own_conn:
            conn.commit()
    except Exception:
        if own_conn and conn is not None:
            conn.rollback()
        raise
    finally:
        if own_conn and conn is not None:
            conn.close()


def ensure_database_exists() -> None:
    """Create MARIADB_DATABASE if missing (connects without default database)."""
    cfg = DbConfig.from_env()
    assert_safe_identifier(cfg.database, "MARIADB_DATABASE")
    conn = mariadb.connect(
        host=cfg.host,
        port=cfg.port,
        user=cfg.user,
        password=cfg.password,
    )
    try:
        cur = conn.cursor()
        cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{cfg.database}` "
            "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
        )
        conn.commit()
    finally:
        conn.close()
