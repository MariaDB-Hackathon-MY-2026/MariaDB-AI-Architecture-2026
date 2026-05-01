from __future__ import annotations

from dataclasses import dataclass
import threading
import uuid
from typing import Any
import json

from fastapi import Cookie, FastAPI, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from core.db_executor import ensure_database_exists, execute_script_statements, get_app_connection, get_connection, ping_database, runtime_db_config
from core.diagram_assistant import generate_mermaid_from_prompt
from core.er_visualizer import build_mermaid_er_diagram
from core.crud import count_rows, delete_row, fetch_query, fetch_table_page, insert_row, update_row
from core.export_import import import_csv_to_table_mapped, query_result_to_csv_bytes, sniff_csv_header
from core.introspect import (
    list_columns,
    list_foreign_key_constraints,
    list_indexes,
    list_primary_key_columns,
    list_tables,
)
from core.schema_generator import generate_schema_plan, schema_plan_from_dict
from core.sql_builder import build_create_statements
from core.sql_safety import assert_statement_is_safe
from core.sql_safety_readonly import assert_readonly_select
from core.query_assistant import generate_query_plan
from core.write_assistant import generate_write_plan
from core.sql_safety_write import assert_write_dml
from core.alter_builder import (
    build_add_column_statement,
    build_create_index_statement,
    build_drop_column_statement,
    build_drop_index_statement,
    build_modify_column_statement,
    build_rename_column_statement,
    build_rename_table_statement,
)
from core.schema_types import ColumnPlan, SchemaPlan
from core.migration_assistant import generate_migration_plan
from demo.demo_loader import run_openflights_demo
from demo.openflights_official_loader import load_official_subset
from utils.mermaid_links import mermaid_ink_url, mermaid_live_edit_url
from core.llm_client import runtime_llm_config

from passlib.context import CryptContext
from cryptography.fernet import Fernet
import base64
import hashlib
from datetime import datetime, timedelta, timezone
import contextvars
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

app = FastAPI(title="MariaDB AI Architect API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",   # vite preview
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_login(session_id: str | None) -> str:
    return _require_user_id(session_id)

def _ensure_app_tables() -> None:
    """Create internal persistence tables if missing."""
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_audit_log` (
              `id` BIGINT NOT NULL AUTO_INCREMENT,
              `at` VARCHAR(32) NOT NULL,
              `kind` VARCHAR(32) NOT NULL,
              `user_id` VARCHAR(64) NULL,
              `statement` TEXT NOT NULL,
              PRIMARY KEY (`id`),
              KEY `ix_app_audit_at` (`at`),
              KEY `ix_app_audit_kind` (`kind`),
              KEY `ix_app_audit_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_schema_snapshots` (
              `id` VARCHAR(64) NOT NULL,
              `at` VARCHAR(32) NOT NULL,
              `label` VARCHAR(255) NULL,
              `user_id` VARCHAR(64) NULL,
              `payload_json` LONGTEXT NOT NULL,
              PRIMARY KEY (`id`),
              KEY `ix_app_schema_snapshots_at` (`at`),
              KEY `ix_app_schema_snapshots_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_jobs` (
              `id` VARCHAR(64) NOT NULL,
              `created_at` VARCHAR(32) NOT NULL,
              `kind` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(64) NULL,
              `status` VARCHAR(16) NOT NULL,
              `message` TEXT NOT NULL,
              `result_json` LONGTEXT NULL,
              `error` TEXT NULL,
              PRIMARY KEY (`id`),
              KEY `ix_app_jobs_created_at` (`created_at`),
              KEY `ix_app_jobs_kind` (`kind`),
              KEY `ix_app_jobs_status` (`status`),
              KEY `ix_app_jobs_user` (`user_id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        # Back-compat: older installs without user_id columns.
        cur.execute("ALTER TABLE app_audit_log ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL")
        cur.execute("ALTER TABLE app_schema_snapshots ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL")
        cur.execute("ALTER TABLE app_jobs ADD COLUMN IF NOT EXISTS user_id VARCHAR(64) NULL")
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_users` (
              `id` VARCHAR(64) NOT NULL,
              `email` VARCHAR(255) NOT NULL,
              `password_hash` TEXT NOT NULL,
              `created_at` VARCHAR(32) NOT NULL,
              PRIMARY KEY (`id`),
              UNIQUE KEY `ux_app_users_email` (`email`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_user_settings` (
              `user_id` VARCHAR(64) NOT NULL,
              `mariadb_host` VARCHAR(255) NOT NULL,
              `mariadb_port` INT NOT NULL,
              `mariadb_user` VARCHAR(255) NOT NULL,
              `mariadb_password_enc` TEXT NOT NULL,
              `mariadb_database` VARCHAR(255) NOT NULL,
              `ollama_base_url` VARCHAR(255) NOT NULL,
              `ollama_model` VARCHAR(255) NOT NULL,
              `updated_at` VARCHAR(32) NOT NULL,
              PRIMARY KEY (`user_id`),
              CONSTRAINT `fk_app_user_settings_user_id` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS `app_sessions` (
              `id` VARCHAR(64) NOT NULL,
              `user_id` VARCHAR(64) NOT NULL,
              `created_at` VARCHAR(32) NOT NULL,
              `expires_at` VARCHAR(32) NOT NULL,
              PRIMARY KEY (`id`),
              KEY `ix_app_sessions_expires_at` (`expires_at`),
              CONSTRAINT `fk_app_sessions_user_id` FOREIGN KEY (`user_id`) REFERENCES `app_users` (`id`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """
        )
        conn.commit()
    finally:
        conn.close()


@app.on_event("startup")
def _startup() -> None:
    try:
        _ensure_app_tables()
    except Exception:
        # Best-effort: API can still start for /health debug.
        pass


_PWD = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
_CURRENT_USER_ID: contextvars.ContextVar[str | None] = contextvars.ContextVar("current_user_id", default=None)


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')


def _iso_after(hours: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime('%Y-%m-%d %H:%M:%S')


def _fernet() -> Fernet:
    import os

    secret = (os.getenv("APP_SECRET_KEY", "") or "").strip()
    if not secret:
        raise RuntimeError("APP_SECRET_KEY is missing. Set it in .env (any long random string).")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def _encrypt(text: str) -> str:
    return _fernet().encrypt((text or "").encode("utf-8")).decode("ascii")


def _decrypt(token: str) -> str:
    return _fernet().decrypt((token or "").encode("ascii")).decode("utf-8")

def _db_unavailable_http(exc: Exception) -> HTTPException:
    detail = (
        "Database connection failed. If you see caching_sha2_password.dll missing, "
        "your MariaDB Connector/C install is missing that plugin OR your DB user is using "
        "caching_sha2_password authentication. Fix by either:\n"
        "- changing the DB user to mysql_native_password, or\n"
        "- installing/reinstalling MariaDB Connector/C (matching 64-bit) with auth plugins.\n"
        f"Error: {exc}"
    )
    return HTTPException(status_code=503, detail=detail)

def _require_user_id(session_id: str | None) -> str:
    if not session_id:
        raise HTTPException(status_code=401, detail="not authenticated")
    try:
        conn = get_app_connection()
    except Exception as exc:  # noqa: BLE001
        raise _db_unavailable_http(exc) from exc
    try:
        cur = conn.cursor()
        cur.execute("SELECT user_id, expires_at FROM app_sessions WHERE id=?", (session_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="invalid session")
        user_id, expires_at = row[0], row[1]
        # lexical compare works for ISO UTC timestamps
        if expires_at < _now_iso():
            raise HTTPException(status_code=401, detail="session expired")
        return str(user_id)
    finally:
        conn.close()


def _load_user_settings(user_id: str) -> dict[str, Any] | None:
    try:
        conn = get_app_connection()
    except Exception as exc:  # noqa: BLE001
        raise _db_unavailable_http(exc) from exc
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT mariadb_host, mariadb_port, mariadb_user, mariadb_password_enc, mariadb_database, ollama_base_url, ollama_model
            FROM app_user_settings
            WHERE user_id=?
            """,
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        return {
            "mariadb_host": row[0],
            "mariadb_port": int(row[1]),
            "mariadb_user": row[2],
            "mariadb_password": _decrypt(row[3]),
            "mariadb_database": row[4],
            "ollama_base_url": row[5],
            "ollama_model": row[6],
        }
    finally:
        conn.close()


class _UserContextMiddleware:
    """Pure ASGI middleware — avoids BaseHTTPMiddleware's task-isolation bug where
    ContextVars set in the middleware are not visible to run_in_threadpool endpoints."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        if request.method == "OPTIONS":
            await self.app(scope, receive, send)
            return

        session_id = request.cookies.get("session_id")
        token_user = _CURRENT_USER_ID.set(None)
        try:
            if not session_id:
                public_prefixes = ("/health", "/auth/", "/auth", "/settings")
                if not request.url.path.startswith(public_prefixes):
                    await Response(
                        content=json.dumps({"detail": "not authenticated"}),
                        status_code=401,
                        media_type="application/json",
                    )(scope, receive, send)
                    return
                await self.app(scope, receive, send)
                return

            user_id = _require_user_id(session_id)
            settings = _load_user_settings(user_id)
            scope.setdefault("state", {})
            scope["state"]["user_id"] = user_id
            scope["state"]["settings"] = settings
            _CURRENT_USER_ID.set(user_id)

            if not settings and not request.url.path.startswith(("/settings", "/auth/")):
                await Response(
                    content=json.dumps({"detail": "Missing settings. Configure MariaDB + Ollama in Settings first."}),
                    status_code=400,
                    media_type="application/json",
                )(scope, receive, send)
                return

            if settings and not request.url.path.startswith(("/auth", "/settings", "/health")):
                with runtime_db_config(
                    host=settings["mariadb_host"],
                    port=settings["mariadb_port"],
                    user=settings["mariadb_user"],
                    password=settings["mariadb_password"],
                    database=settings["mariadb_database"],
                ), runtime_llm_config(
                    base_url=settings["ollama_base_url"],
                    model=settings["ollama_model"],
                ):
                    await self.app(scope, receive, send)
                return

            await self.app(scope, receive, send)

        except HTTPException as exc:
            await Response(
                content=json.dumps({"detail": exc.detail}),
                status_code=exc.status_code,
                media_type="application/json",
            )(scope, receive, send)
        except Exception:
            await Response(
                content=json.dumps({"detail": "Internal server error"}),
                status_code=500,
                media_type="application/json",
            )(scope, receive, send)
        finally:
            _CURRENT_USER_ID.reset(token_user)


app.add_middleware(_UserContextMiddleware)


def _audit(kind: str, statement: str) -> None:
    from utils.audit_log import now_iso

    at = now_iso()
    user_id = _CURRENT_USER_ID.get()
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO app_audit_log (`at`, `kind`, `user_id`, `statement`) VALUES (?, ?, ?, ?)",
            (at, kind, user_id, statement),
        )
        conn.commit()
    finally:
        conn.close()


@dataclass
class _Job:
    id: str
    kind: str
    status: str  # queued|running|done|error
    message: str
    result: dict | None = None
    error: str | None = None


_JOBS: dict[str, _Job] = {}

@dataclass(frozen=True)
class _SchemaSnapshot:
    id: str
    at: str
    label: str | None
    tables: tuple[str, ...]
    columns_by_table: dict[str, tuple[str, ...]]
    fks: tuple[tuple[str, str, str, str], ...]  # table, col, ref_table, ref_col


_SCHEMA_VERSIONS: list[_SchemaSnapshot] = []


def _start_job(kind: str, fn) -> str:
    job_id = uuid.uuid4().hex
    job = _Job(id=job_id, kind=kind, status="queued", message="Queued")
    _JOBS[job_id] = job
    try:
        from utils.audit_log import now_iso

        user_id = _CURRENT_USER_ID.get()
        conn = get_app_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO app_jobs (id, created_at, kind, user_id, status, message) VALUES (?, ?, ?, ?, ?, ?)",
                (job_id, now_iso(), kind, user_id, "queued", "Queued"),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass

    def runner():
        job.status = "running"
        job.message = "Running…"
        try:
            conn = get_app_connection()
            try:
                cur = conn.cursor()
                cur.execute(
                    "UPDATE app_jobs SET status=?, message=? WHERE id=?",
                    ("running", job.message, job_id),
                )
                conn.commit()
            finally:
                conn.close()
        except Exception:
            pass
        try:
            res = fn(lambda msg: setattr(job, "message", msg))
            job.result = res
            job.status = "done"
            job.message = "Done"
            try:
                conn = get_app_connection()
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE app_jobs SET status=?, message=?, result_json=? WHERE id=?",
                        ("done", job.message, json.dumps(res, ensure_ascii=False), job_id),
                    )
                    conn.commit()
                finally:
                    conn.close()
            except Exception:
                pass
        except Exception as exc:  # noqa: BLE001
            job.status = "error"
            job.error = str(exc)
            job.message = "Error"
            _audit("error", f"job_error({kind}): {exc}")
            try:
                conn = get_app_connection()
                try:
                    cur = conn.cursor()
                    cur.execute(
                        "UPDATE app_jobs SET status=?, message=?, error=? WHERE id=?",
                        ("error", job.message, str(exc), job_id),
                    )
                    conn.commit()
                finally:
                    conn.close()
            except Exception:
                pass

    def _runner_with_cleanup():
        runner()
        threading.Timer(300, lambda: _JOBS.pop(job_id, None)).start()

    # Capture the current context so _RUNTIME_DB and _RUNTIME_LLM carry the
    # user's settings into the background thread.  Python < 3.12 threads do
    # NOT inherit ContextVar values from the spawning thread automatically;
    # only asyncio/anyio threadpools do (via ctx.run).
    _ctx = contextvars.copy_context()
    threading.Thread(target=lambda: _ctx.run(_runner_with_cleanup), daemon=True).start()
    return job_id


class JobStatusResponse(BaseModel):
    id: str
    kind: str
    status: str
    message: str
    result: dict | None = None
    error: str | None = None


@app.get("/jobs/{job_id}", response_model=JobStatusResponse)
def job_status(job_id: str) -> JobStatusResponse:
    job = _JOBS.get(job_id)
    if job:
        return JobStatusResponse(
            id=job.id,
            kind=job.kind,
            status=job.status,
            message=job.message,
            result=job.result,
            error=job.error,
        )
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT kind, status, message, result_json, error FROM app_jobs WHERE id=?", (job_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="job not found")
        result_json = row[3]
        result = json.loads(result_json) if result_json else None
        return JobStatusResponse(id=job_id, kind=row[0], status=row[1], message=row[2], result=result, error=row[4])
    finally:
        conn.close()


class DemoStartResponse(BaseModel):
    job_id: str


@app.post("/demo/openflights/sample", response_model=DemoStartResponse)
def demo_openflights_sample(reset_first: bool = True) -> DemoStartResponse:
    def work(on_progress):
        on_progress("Loading sample OpenFlights…")
        counts = run_openflights_demo(reset_first=reset_first, disable_fk_checks=True)
        _audit("executed", f"demo_sample_openflights: {counts}")
        return {"counts": counts}

    return DemoStartResponse(job_id=_start_job("demo_openflights_sample", work))


@app.post("/demo/openflights/official", response_model=DemoStartResponse)
def demo_openflights_official(
    airport_limit: int = 5000,
    airline_limit: int = 3000,
    route_limit: int = 20000,
    reset_first: bool = True,
) -> DemoStartResponse:
    from pathlib import Path

    repo_dir = Path(__file__).resolve().parent.parent / "demo" / "_openflights_repo"

    def work(on_progress):
        def cb(msg: str):
            on_progress(msg)

        counts = load_official_subset(
            repo_dir=repo_dir,
            airport_limit=int(airport_limit),
            airline_limit=int(airline_limit),
            route_limit=int(route_limit),
            reset_first=reset_first,
            disable_fk_checks=True,
            on_progress=cb,
        )
        res = {"airports": counts.airports, "airlines": counts.airlines, "routes": counts.routes, "elapsed_s": counts.elapsed_s}
        _audit("executed", f"demo_official_openflights: {res}")
        return {"counts": res}

    return DemoStartResponse(job_id=_start_job("demo_openflights_official", work))


class SchemaSnapshotResponse(BaseModel):
    id: str
    at: str
    label: str | None = None
    tables: list[str]


class SaveSchemaSnapshotRequest(BaseModel):
    label: str | None = None


@app.post("/schema/versions/save", response_model=SchemaSnapshotResponse)
def save_schema_snapshot(body: SaveSchemaSnapshotRequest) -> SchemaSnapshotResponse:
    from utils.audit_log import now_iso

    tables = list_tables()
    cols = list_columns()
    fks = list_foreign_key_constraints()

    columns_by_table: dict[str, list[str]] = {t: [] for t in tables}
    for c in cols:
        columns_by_table.setdefault(c.table_name, []).append(c.column_name)

    fk_tuples: list[tuple[str, str, str, str]] = []
    for fk in fks:
        fk_tuples.append((fk.table_name, fk.column_name, fk.referenced_table_name, fk.referenced_column_name))

    snap = _SchemaSnapshot(
        id=uuid.uuid4().hex,
        at=now_iso(),
        label=(body.label.strip() if body.label and body.label.strip() else None),
        tables=tuple(tables),
        columns_by_table={k: tuple(v) for k, v in columns_by_table.items()},
        fks=tuple(fk_tuples),
    )
    _SCHEMA_VERSIONS.append(snap)
    try:
        user_id = _CURRENT_USER_ID.get()
        payload = {
            "tables": list(snap.tables),
            "columns_by_table": {k: list(v) for k, v in snap.columns_by_table.items()},
            "fks": [list(x) for x in snap.fks],
        }
        conn = get_app_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO app_schema_snapshots (id, at, label, user_id, payload_json) VALUES (?, ?, ?, ?, ?)",
                (snap.id, snap.at, snap.label, user_id, json.dumps(payload, ensure_ascii=False)),
            )
            conn.commit()
        finally:
            conn.close()
    except Exception:
        pass
    _audit("saved", f"schema_snapshot: id={snap.id} label={snap.label or ''}")
    return SchemaSnapshotResponse(id=snap.id, at=snap.at, label=snap.label, tables=list(snap.tables))


class ListSchemaSnapshotsResponse(BaseModel):
    versions: list[SchemaSnapshotResponse]


@app.get("/schema/versions", response_model=ListSchemaSnapshotsResponse)
def list_schema_snapshots() -> ListSchemaSnapshotsResponse:
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        user_id = _CURRENT_USER_ID.get()
        if user_id:
            cur.execute(
                "SELECT id, at, label, payload_json FROM app_schema_snapshots WHERE user_id=? ORDER BY at DESC LIMIT 200",
                (user_id,),
            )
        else:
            cur.execute("SELECT id, at, label, payload_json FROM app_schema_snapshots ORDER BY at DESC LIMIT 200")
        out: list[SchemaSnapshotResponse] = []
        for rid, at, label, payload_json in cur.fetchall():
            try:
                payload = json.loads(payload_json) if payload_json else {}
                tables = payload.get("tables") or []
            except Exception:
                tables = []
            out.append(SchemaSnapshotResponse(id=rid, at=at, label=label, tables=list(tables)))
        return ListSchemaSnapshotsResponse(versions=out)
    finally:
        conn.close()


@app.post("/schema/versions/clear")
def clear_schema_snapshots() -> dict:
    _SCHEMA_VERSIONS.clear()
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        user_id = _CURRENT_USER_ID.get()
        if user_id:
            cur.execute("DELETE FROM app_schema_snapshots WHERE user_id=?", (user_id,))
        else:
            cur.execute("DELETE FROM app_schema_snapshots")
        conn.commit()
    finally:
        conn.close()
    _audit("cleared", "schema_snapshots_clear")
    return {"ok": True}


class DiffSchemaSnapshotsRequest(BaseModel):
    a_id: str
    b_id: str


class SchemaDiffResponse(BaseModel):
    tables_added: list[str]
    tables_removed: list[str]
    columns_added: list[str]
    columns_removed: list[str]
    fks_added: list[str]
    fks_removed: list[str]


def _find_snapshot(sid: str) -> _SchemaSnapshot:
    for v in _SCHEMA_VERSIONS:
        if v.id == sid:
            return v
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT at, label, payload_json FROM app_schema_snapshots WHERE id=?", (sid,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="snapshot not found")
        payload = json.loads(row[2]) if row[2] else {}
        tables = tuple(payload.get("tables") or [])
        columns_by_table = {k: tuple(v) for k, v in (payload.get("columns_by_table") or {}).items()}
        fks = tuple(tuple(x) for x in (payload.get("fks") or []))
        return _SchemaSnapshot(id=sid, at=row[0], label=row[1], tables=tables, columns_by_table=columns_by_table, fks=fks)  # type: ignore[arg-type]
    finally:
        conn.close()


@app.post("/schema/versions/diff", response_model=SchemaDiffResponse)
def diff_schema_snapshots(body: DiffSchemaSnapshotsRequest) -> SchemaDiffResponse:
    a = _find_snapshot(body.a_id)
    b = _find_snapshot(body.b_id)

    a_tables = set(a.tables)
    b_tables = set(b.tables)

    def col_key(t: str, c: str) -> str:
        return f"{t}.{c}"

    a_cols = set(col_key(t, c) for t, cols in a.columns_by_table.items() for c in cols)
    b_cols = set(col_key(t, c) for t, cols in b.columns_by_table.items() for c in cols)

    def fk_key(t: str, c: str, rt: str, rc: str) -> str:
        return f"{t}.{c} -> {rt}.{rc}"

    a_fks = set(fk_key(*fk) for fk in a.fks)
    b_fks = set(fk_key(*fk) for fk in b.fks)

    return SchemaDiffResponse(
        tables_added=sorted(b_tables - a_tables),
        tables_removed=sorted(a_tables - b_tables),
        columns_added=sorted(b_cols - a_cols),
        columns_removed=sorted(a_cols - b_cols),
        fks_added=sorted(b_fks - a_fks),
        fks_removed=sorted(a_fks - b_fks),
    )

class AuditEntryModel(BaseModel):
    at: str
    kind: str
    statement: str


class AuditResponse(BaseModel):
    entries: list[AuditEntryModel]


@app.get("/audit", response_model=AuditResponse)
def audit_list() -> AuditResponse:
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        user_id = _CURRENT_USER_ID.get()
        if user_id:
            cur.execute(
                "SELECT at, kind, statement FROM app_audit_log WHERE user_id=? ORDER BY id DESC LIMIT 500",
                (user_id,),
            )
        else:
            cur.execute("SELECT at, kind, statement FROM app_audit_log ORDER BY id DESC LIMIT 500")
        rows = cur.fetchall()
        entries = [AuditEntryModel(at=r[0], kind=r[1], statement=r[2]) for r in rows]
        return AuditResponse(entries=entries)
    finally:
        conn.close()


@app.post("/audit/clear", response_model=AuditResponse)
def audit_clear() -> AuditResponse:
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        user_id = _CURRENT_USER_ID.get()
        if user_id:
            cur.execute("DELETE FROM app_audit_log WHERE user_id=?", (user_id,))
        else:
            cur.execute("DELETE FROM app_audit_log")
        conn.commit()
    finally:
        conn.close()
    return AuditResponse(entries=[])


class DatabaseExportResponse(BaseModel):
    sql: str
    filename: str
    table_count: int
    row_count: int


@app.get("/export/database/sql", response_model=DatabaseExportResponse)
def export_database_sql() -> DatabaseExportResponse:
    """Full mysqldump-style export: DDL + INSERT data for every table."""
    from core.export_import import dump_full_sql
    from utils.audit_log import now_iso

    result = dump_full_sql()
    filename = f"export_{now_iso()[:10]}.sql"
    _audit("export", f"full_sql_export: {result.table_count} tables, {result.row_count} rows")
    return DatabaseExportResponse(
        sql=result.sql,
        filename=filename,
        table_count=result.table_count,
        row_count=result.row_count,
    )


class HealthResponse(BaseModel):
    ok: bool
    database: str


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    ok, msg = ping_database()
    return HealthResponse(ok=bool(ok), database=msg)


@app.get("/health/ollama")
def health_ollama(session_id: str | None = Cookie(default=None)) -> dict:
    user_id = _require_user_id(session_id)
    settings = _load_user_settings(user_id)
    if not settings:
        return {"ok": False, "message": "No settings configured."}
    base_url = (settings["ollama_base_url"] or "").strip().rstrip("/")
    if not base_url:
        return {"ok": False, "message": "Ollama base URL not configured."}
    try:
        import httpx
        with httpx.Client(timeout=5.0) as client:
            res = client.get(f"{base_url}/api/tags")
            res.raise_for_status()
        return {"ok": True, "message": f"Ollama reachable at {base_url}"}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "message": str(exc)}


class MeResponse(BaseModel):
    id: str
    email: str
    has_settings: bool


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


@app.post("/auth/register", response_model=MeResponse)
def auth_register(body: RegisterRequest) -> MeResponse:
    email = body.email.strip().lower()
    pw_hash = _PWD.hash(body.password)
    user_id = uuid.uuid4().hex
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO app_users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (user_id, email, pw_hash, _now_iso()),
        )
        conn.commit()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()
    _audit("saved", f"user_register: {email}")
    return MeResponse(id=user_id, email=email, has_settings=False)


@app.post("/auth/login", response_model=MeResponse)
def auth_login(body: LoginRequest, response: Response) -> MeResponse:
    email = body.email.strip().lower()
    try:
        conn = get_app_connection()
    except Exception as exc:  # noqa: BLE001
        raise _db_unavailable_http(exc) from exc
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, password_hash FROM app_users WHERE email=?", (email,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="invalid email or password")
        user_id, pw_hash = row[0], row[1]
        if not _PWD.verify(body.password, pw_hash):
            raise HTTPException(status_code=401, detail="invalid email or password")
        cur.execute("DELETE FROM app_sessions WHERE expires_at < ?", (_now_iso(),))
        session_id = uuid.uuid4().hex
        expires_at = _iso_after(24 * 7)
        cur.execute(
            "INSERT INTO app_sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, _now_iso(), expires_at),
        )
        conn.commit()
    finally:
        conn.close()

    response.set_cookie(
        "session_id",
        session_id,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )
    has_settings = _load_user_settings(str(user_id)) is not None
    _audit("executed", f"user_login: {email}")
    return MeResponse(id=str(user_id), email=email, has_settings=has_settings)


@app.post("/auth/logout")
def auth_logout(response: Response, session_id: str | None = Cookie(default=None)) -> dict:
    if session_id:
        try:
            conn = get_app_connection()
        except Exception as exc:  # noqa: BLE001
            raise _db_unavailable_http(exc) from exc
        try:
            cur = conn.cursor()
            cur.execute("DELETE FROM app_sessions WHERE id=?", (session_id,))
            conn.commit()
        finally:
            conn.close()
    response.delete_cookie("session_id", path="/")
    return {"ok": True}


@app.get("/auth/me", response_model=MeResponse)
def auth_me(request: Request, session_id: str | None = Cookie(default=None)) -> MeResponse:
    user_id = _require_user_id(session_id)
    try:
        conn = get_app_connection()
    except Exception as exc:  # noqa: BLE001
        raise _db_unavailable_http(exc) from exc
    try:
        cur = conn.cursor()
        cur.execute("SELECT email FROM app_users WHERE id=?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="invalid session")
        email = row[0]
    finally:
        conn.close()
    has_settings = _load_user_settings(user_id) is not None
    return MeResponse(id=user_id, email=email, has_settings=has_settings)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6)


@app.post("/auth/change-password")
def change_password(
    body: ChangePasswordRequest,
    session_id: str | None = Cookie(default=None),
) -> dict:
    user_id = _require_user_id(session_id)
    conn = get_app_connection()
    try:
        cur = conn.cursor()
        cur.execute("SELECT password_hash FROM app_users WHERE id=?", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="user not found")
        if not _PWD.verify(body.current_password, row[0]):
            raise HTTPException(status_code=400, detail="Current password is incorrect.")
        new_hash = _PWD.hash(body.new_password)
        cur.execute("UPDATE app_users SET password_hash=? WHERE id=?", (new_hash, user_id))
        conn.commit()
    finally:
        conn.close()
    _audit("saved", f"password_changed: user_id={user_id}")
    return {"ok": True}


class UserSettingsModel(BaseModel):
    mariadb_host: str
    mariadb_port: int = Field(default=3306, ge=1, le=65535)
    mariadb_user: str
    mariadb_password: str
    mariadb_database: str
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "qwen2.5-coder:7b"


@app.get("/settings", response_model=UserSettingsModel)
def get_settings(session_id: str | None = Cookie(default=None)) -> UserSettingsModel:
    user_id = _require_user_id(session_id)
    s = _load_user_settings(user_id)
    if not s:
        # Empty defaults; user will fill in.
        return UserSettingsModel(
            mariadb_host="127.0.0.1",
            mariadb_port=3306,
            mariadb_user="root",
            mariadb_password="",
            mariadb_database="mariadb_ai_architect",
            ollama_base_url="http://127.0.0.1:11434",
            ollama_model="qwen2.5-coder:7b",
        )
    return UserSettingsModel(
        mariadb_host=s["mariadb_host"],
        mariadb_port=s["mariadb_port"],
        mariadb_user=s["mariadb_user"],
        mariadb_password=s["mariadb_password"],
        mariadb_database=s["mariadb_database"],
        ollama_base_url=s["ollama_base_url"],
        ollama_model=s["ollama_model"],
    )


@app.post("/settings", response_model=dict)
def save_settings(body: UserSettingsModel, session_id: str | None = Cookie(default=None)) -> dict:
    try:
        user_id = _require_user_id(session_id)
        conn = get_app_connection()
        try:
            cur = conn.cursor()
            cur.execute(
                """
                INSERT INTO app_user_settings
                  (user_id, mariadb_host, mariadb_port, mariadb_user, mariadb_password_enc, mariadb_database, ollama_base_url, ollama_model, updated_at)
                VALUES
                  (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  mariadb_host=VALUES(mariadb_host),
                  mariadb_port=VALUES(mariadb_port),
                  mariadb_user=VALUES(mariadb_user),
                  mariadb_password_enc=VALUES(mariadb_password_enc),
                  mariadb_database=VALUES(mariadb_database),
                  ollama_base_url=VALUES(ollama_base_url),
                  ollama_model=VALUES(ollama_model),
                  updated_at=VALUES(updated_at)
                """,
                (
                    user_id,
                    body.mariadb_host.strip(),
                    int(body.mariadb_port),
                    body.mariadb_user.strip(),
                    _encrypt(body.mariadb_password or ""),
                    body.mariadb_database.strip(),
                    (body.ollama_base_url or "").strip().rstrip("/"),
                    (body.ollama_model or "").strip(),
                    _now_iso(),
                ),
            )
            conn.commit()
        finally:
            conn.close()
        _audit("saved", f"settings_saved: user_id={user_id}")
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/settings/test-db")
def test_db(body: UserSettingsModel, session_id: str | None = Cookie(default=None)) -> dict:
    _require_user_id(session_id)
    try:
        with runtime_db_config(
            host=body.mariadb_host.strip(),
            port=int(body.mariadb_port),
            user=body.mariadb_user.strip(),
            password=body.mariadb_password or "",
            database=body.mariadb_database.strip(),
        ):
            ok, msg = ping_database()
            if not ok:
                raise ValueError(msg)
            return {"ok": True, "message": msg}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/settings/test-ollama")
def test_ollama(body: UserSettingsModel, session_id: str | None = Cookie(default=None)) -> dict:
    _require_user_id(session_id)
    try:
        with runtime_llm_config(base_url=body.ollama_base_url, model=body.ollama_model):
            # Minimal call to validate model is available and server is reachable.
            plan = generate_mermaid_from_prompt(prompt="flowchart LR\nA-->B\n", timeout_s=120.0)
            code = getattr(plan, "code", "")
            if not isinstance(code, str) or not code.strip():
                raise ValueError("Model returned empty Mermaid code.")
        return {"ok": True}
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SchemaGenerateRequest(BaseModel):
    request: str = Field(min_length=1)


class SchemaGenerateResponse(BaseModel):
    plan: dict
    statements: list[str]


def _plan_to_dict(plan: SchemaPlan) -> dict:
    return {
        "database_name": plan.database_name,
        "tables": [
            {
                "name": t.name,
                "columns": [
                    {
                        "name": c.name,
                        "sql_type": c.sql_type,
                        "is_nullable": c.is_nullable,
                        "is_primary_key": c.is_primary_key,
                        "is_auto_increment": c.is_auto_increment,
                        "default": c.default,
                        "references": c.references,
                    }
                    for c in t.columns
                ],
                "unique_indexes": [list(idx) for idx in t.unique_indexes],
                "indexes": [list(idx) for idx in t.indexes],
            }
            for t in plan.tables
        ],
    }


@app.post("/schema/generate", response_model=SchemaGenerateResponse)
def schema_generate(body: SchemaGenerateRequest) -> SchemaGenerateResponse:
    try:
        plan = generate_schema_plan(user_request=body.request)
        statements = build_create_statements(plan)
        for s in statements:
            assert_statement_is_safe(s)
        _audit("generated", f"schema_generate: {body.request}")
        return SchemaGenerateResponse(plan=_plan_to_dict(plan), statements=statements)
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"schema_generate_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SchemaBuildRequest(BaseModel):
    plan: dict


@app.post("/schema/build", response_model=SchemaGenerateResponse)
def schema_build(body: SchemaBuildRequest) -> SchemaGenerateResponse:
    try:
        plan = schema_plan_from_dict(body.plan)
        statements = build_create_statements(plan)
        for s in statements:
            assert_statement_is_safe(s)
        return SchemaGenerateResponse(plan=_plan_to_dict(plan), statements=statements)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SchemaExecuteRequest(BaseModel):
    statements: list[str] = Field(min_length=1)


class SchemaExecuteResponse(BaseModel):
    executed: int


@app.post("/schema/execute", response_model=SchemaExecuteResponse)
def schema_execute(body: SchemaExecuteRequest) -> SchemaExecuteResponse:
    try:
        for s in body.statements:
            assert_statement_is_safe(s)
            _audit("generated", s)
        execute_script_statements(body.statements)
        for s in body.statements:
            _audit("executed", s)
        return SchemaExecuteResponse(executed=len(body.statements))
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"schema_execute_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SqlExecuteRequest(BaseModel):
    statements: list[str] = Field(min_length=1)


class SqlExecuteResponse(BaseModel):
    executed: int


@app.post("/sql/execute", response_model=SqlExecuteResponse)
def sql_execute(body: SqlExecuteRequest) -> SqlExecuteResponse:
    """Execute a validated set of DDL statements (ALTER/CREATE INDEX/CREATE TABLE).

    This is used by the React migrations workspace.
    """
    try:
        for s in body.statements:
            assert_statement_is_safe(s)
            _audit("generated", s)
        execute_script_statements(body.statements)
        for s in body.statements:
            _audit("executed", s)
        return SqlExecuteResponse(executed=len(body.statements))
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"sql_execute_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class EnsureDbResponse(BaseModel):
    ok: bool
    message: str


@app.post("/db/ensure", response_model=EnsureDbResponse)
def db_ensure() -> EnsureDbResponse:
    try:
        ensure_database_exists()
        _audit("executed", "db_ensure")
        return EnsureDbResponse(ok=True, message="Database ensured (created if missing).")
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"db_ensure_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class QueryGenerateRequest(BaseModel):
    question: str = Field(min_length=1)


class QueryPlanResponse(BaseModel):
    title: str | None
    sql: str
    params: list[Any]


@app.post("/query/generate", response_model=QueryPlanResponse)
def query_generate(body: QueryGenerateRequest) -> QueryPlanResponse:
    try:
        plan = generate_query_plan(question=body.question)
        assert_readonly_select(plan.sql)
        _audit("generated", f"query_generate: {body.question}")
        _audit("generated", plan.sql)
        return QueryPlanResponse(title=plan.title, sql=plan.sql, params=list(plan.params))
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"query_generate_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class QueryExecuteRequest(BaseModel):
    sql: str = Field(min_length=1)
    params: list[Any] = Field(default_factory=list)


class QueryExecuteResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]


@app.post("/query/execute", response_model=QueryExecuteResponse)
def query_execute(body: QueryExecuteRequest) -> QueryExecuteResponse:
    try:
        assert_readonly_select(body.sql)
        result = fetch_query(sql=body.sql, params=tuple(body.params))
        _audit("executed", body.sql)
        return QueryExecuteResponse(columns=result.columns, rows=[list(r) for r in result.rows])
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"query_execute_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/query/export")
def query_export(body: QueryExecuteRequest):
    try:
        assert_readonly_select(body.sql)
        result = fetch_query(sql=body.sql, params=tuple(body.params))
        data = query_result_to_csv_bytes(result)
        _audit("executed", f"query_export: {body.sql}")
        return {
            "filename": "query-results.csv",
            "mime": "text/csv",
            "data_base64": __import__("base64").b64encode(data).decode("ascii"),
        }
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"query_export_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class WritePreviewRequest(BaseModel):
    request: str = Field(min_length=1)


class WritePreviewResponse(BaseModel):
    operation: str
    title: str
    write_sql: str
    preview_sql: str
    params: list[Any]
    preview_params: list[Any]
    preview_columns: list[str]
    preview_rows: list[list[Any]]


def _ensure_case_else(sql: str) -> str:
    """Inject ELSE col into a CASE expression that is missing one.

    Without ELSE, SQL CASE returns NULL for unmatched rows — silently wiping data.
    We detect `CASE ... END` blocks that have no ELSE and insert `ELSE <col>` before END,
    where <col> is extracted from the `SET col = CASE` pattern.
    """
    import re as _re
    # Find  SET `col` = CASE ... END  (or SET col = CASE ... END)
    set_match = _re.search(r'SET\s+(`?\w+`?)\s*=\s*CASE\b', sql, _re.IGNORECASE)
    if not set_match:
        return sql
    col = set_match.group(1)
    # Only patch if there is no ELSE already
    if _re.search(r'\bELSE\b', sql, _re.IGNORECASE):
        return sql
    # Insert ELSE col before the closing END
    fixed = _re.sub(r'\bEND\b', f'ELSE {col} END', sql, count=1, flags=_re.IGNORECASE)
    return fixed


def _normalize_insert(write_sql: str, params: list[Any]) -> tuple[str, list[str], list[list[Any]]]:
    """Parse and fix an INSERT statement so VALUES groups always match the column count.

    The LLM sometimes generates INSERT INTO t (col) VALUES (?, ?), (?, ?) — correct
    total param count but wrong grouping (2 per group instead of 1).  We rebuild the
    VALUES clause from scratch using the parsed column list and the flat params list,
    guaranteeing the SQL MariaDB receives is well-formed.

    Returns (fixed_write_sql, col_names, rows).
    """
    import re as _re
    col_match = _re.search(r'\(\s*([^)]+)\)\s*VALUES', write_sql, _re.IGNORECASE)
    if not col_match:
        raise ValueError("Could not parse column list from INSERT statement")
    col_names = [c.strip().strip('`"') for c in col_match.group(1).split(',')]
    n_cols = len(col_names)
    if n_cols == 0:
        raise ValueError("INSERT has no columns")
    if len(params) == 0:
        raise ValueError("INSERT has no parameter values")
    if len(params) % n_cols != 0:
        raise ValueError(
            f"Param count {len(params)} is not divisible by column count {n_cols} — "
            "the model generated mismatched placeholders. Try again."
        )
    n_rows = len(params) // n_cols
    row_placeholder = "(" + ", ".join(["?"] * n_cols) + ")"
    values_clause = ", ".join([row_placeholder] * n_rows)
    # Rebuild from the table/column portion only — replace VALUES ... onwards
    fixed_sql = _re.sub(
        r'VALUES\s*[\s\S]*$',
        f"VALUES {values_clause}",
        write_sql,
        flags=_re.IGNORECASE,
    )
    rows = [list(params[i : i + n_cols]) for i in range(0, len(params), n_cols)]
    return fixed_sql, col_names, rows


@app.post("/query/write/preview", response_model=WritePreviewResponse)
def query_write_preview(body: WritePreviewRequest) -> WritePreviewResponse:
    try:
        plan = generate_write_plan(request=body.request)
        assert_write_dml(plan.write_sql)

        if plan.operation == "insert":
            # Normalize the INSERT: fix VALUES grouping and build preview rows — no DB query needed.
            fixed_sql, preview_cols, preview_rows = _normalize_insert(plan.write_sql, list(plan.params))
        else:
            fixed_sql = _ensure_case_else(plan.write_sql)
            assert_readonly_select(plan.preview_sql)
            result = fetch_query(sql=plan.preview_sql, params=tuple(plan.preview_params))
            preview_cols = result.columns
            preview_rows = [list(r) for r in result.rows]

        _audit("generated", f"write_preview: {body.request}")
        _audit("generated", fixed_sql)
        return WritePreviewResponse(
            operation=plan.operation,
            title=plan.title,
            write_sql=fixed_sql,          # send the corrected SQL back to the frontend
            preview_sql=plan.preview_sql,
            params=list(plan.params),
            preview_params=list(plan.preview_params),
            preview_columns=preview_cols,
            preview_rows=preview_rows,
        )
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"write_preview_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class WriteExecuteRequest(BaseModel):
    write_sql: str = Field(min_length=1)
    params: list[Any] = Field(default_factory=list)


class WriteExecuteResponse(BaseModel):
    affected_rows: int


@app.post("/query/write/execute", response_model=WriteExecuteResponse)
def query_write_execute(body: WriteExecuteRequest) -> WriteExecuteResponse:
    try:
        assert_write_dml(body.write_sql)
        conn = get_connection()
        try:
            cur = conn.cursor()
            cur.execute(body.write_sql, tuple(body.params))
            affected = cur.rowcount
            conn.commit()
        finally:
            conn.close()
        _audit("executed", body.write_sql)
        return WriteExecuteResponse(affected_rows=int(affected))
    except Exception as exc:  # noqa: BLE001
        _audit("error", f"write_execute_error: {exc}")
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DiagramRequest(BaseModel):
    kind: str = Field(default="erd")
    focus_tables: list[str] = Field(default_factory=list)
    depth: int = Field(default=1, ge=1, le=2)
    prompt: str | None = None


class DiagramResponse(BaseModel):
    code: str


class MetadataResponse(BaseModel):
    tables: list[str]


@app.get("/metadata", response_model=MetadataResponse)
def metadata() -> MetadataResponse:
    try:
        return MetadataResponse(tables=list_tables())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class SchemaEdge(BaseModel):
    source: str
    target: str


class SchemaEdgesResponse(BaseModel):
    edges: list[SchemaEdge]


@app.get("/schema/edges", response_model=SchemaEdgesResponse)
def get_schema_edges() -> SchemaEdgesResponse:
    try:
        fks = list_foreign_key_constraints()
        return SchemaEdgesResponse(
            edges=[SchemaEdge(source=fk.table_name, target=fk.referenced_table_name) for fk in fks]
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class StatsResponse(BaseModel):
    table_count: int
    total_rows: int
    snapshot_count: int
    audit_count: int


@app.get("/stats", response_model=StatsResponse)
def get_stats() -> StatsResponse:
    try:
        tables = list_tables()
        total_rows = 0
        if tables:
            conn = get_connection()
            try:
                cur = conn.cursor()
                for table in tables:
                    try:
                        cur.execute(f"SELECT COUNT(*) FROM `{table}`")
                        row = cur.fetchone()
                        if row:
                            total_rows += int(row[0])
                    except Exception:
                        pass
            finally:
                conn.close()

        snapshot_count = 0
        audit_count = 0
        app_conn = get_app_connection()
        try:
            cur = app_conn.cursor()
            user_id = _CURRENT_USER_ID.get()
            if user_id:
                cur.execute("SELECT COUNT(*) FROM app_schema_snapshots WHERE user_id=?", (user_id,))
            else:
                cur.execute("SELECT COUNT(*) FROM app_schema_snapshots")
            row = cur.fetchone()
            snapshot_count = int(row[0]) if row else 0

            if user_id:
                cur.execute("SELECT COUNT(*) FROM app_audit_log WHERE user_id=?", (user_id,))
            else:
                cur.execute("SELECT COUNT(*) FROM app_audit_log")
            row = cur.fetchone()
            audit_count = int(row[0]) if row else 0
        finally:
            app_conn.close()

        return StatsResponse(
            table_count=len(tables),
            total_rows=total_rows,
            snapshot_count=snapshot_count,
            audit_count=audit_count,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TableColumn(BaseModel):
    name: str
    sql_type: str
    is_nullable: bool
    is_auto_increment: bool


class ForeignKeyConstraint(BaseModel):
    constraint_name: str
    table_name: str
    column_name: str
    referenced_table_name: str
    referenced_column_name: str
    referenced_label_column: str | None = None
    update_rule: str
    delete_rule: str


class IndexInfoModel(BaseModel):
    index_name: str
    is_unique: bool
    columns: list[str]


class TableMetaResponse(BaseModel):
    table: str
    columns: list[TableColumn]
    primary_key: list[str]
    outbound_foreign_keys: list[ForeignKeyConstraint]
    foreign_keys: list[ForeignKeyConstraint]
    indexes: list[IndexInfoModel]


@app.get("/tables/{table}/meta", response_model=TableMetaResponse)
def table_meta(table: str) -> TableMetaResponse:
    try:
        cols = [c for c in list_columns() if c.table_name == table]
        fks = [
            fk
            for fk in list_foreign_key_constraints()
            if fk.table_name == table or fk.referenced_table_name == table
        ]
        outbound = [fk for fk in fks if fk.table_name == table]
        idxs = [i for i in list_indexes() if i.table_name == table]

        def pick_label_column(*, referenced_table: str, pk_col: str) -> str | None:
            # Heuristic: prefer common "name-ish" columns, else first varchar-ish column.
            rcols = [c for c in list_columns() if c.table_name == referenced_table and c.column_name != pk_col]
            candidates = [c.column_name for c in rcols]
            preferred = ["name", "title", "label", "code", "iata", "icao", "email", "city", "country", "status"]
            for p in preferred:
                if p in candidates:
                    return p
            for c in rcols:
                t = (c.column_type or "").lower()
                if "varchar" in t or "char" in t or "text" in t:
                    return c.column_name
            return None

        return TableMetaResponse(
            table=table,
            columns=[
                TableColumn(
                    name=c.column_name,
                    sql_type=c.column_type,
                    is_nullable=bool(c.is_nullable),
                    is_auto_increment=("auto_increment" in (c.extra or "").lower()),
                )
                for c in cols
            ],
            primary_key=list_primary_key_columns(table_name=table),
            outbound_foreign_keys=[
                ForeignKeyConstraint(
                    constraint_name=fk.constraint_name,
                    table_name=fk.table_name,
                    column_name=fk.column_name,
                    referenced_table_name=fk.referenced_table_name,
                    referenced_column_name=fk.referenced_column_name,
                    referenced_label_column=pick_label_column(
                        referenced_table=fk.referenced_table_name,
                        pk_col=fk.referenced_column_name,
                    ),
                    update_rule=fk.update_rule,
                    delete_rule=fk.delete_rule,
                )
                for fk in outbound
            ],
            foreign_keys=[
                ForeignKeyConstraint(
                    constraint_name=fk.constraint_name,
                    table_name=fk.table_name,
                    column_name=fk.column_name,
                    referenced_table_name=fk.referenced_table_name,
                    referenced_column_name=fk.referenced_column_name,
                    update_rule=fk.update_rule,
                    delete_rule=fk.delete_rule,
                )
                for fk in fks
            ],
            indexes=[
                IndexInfoModel(index_name=i.index_name, is_unique=bool(i.is_unique), columns=list(i.columns))
                for i in idxs
            ],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class BrowseRequest(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=10, le=500)
    order_by: str | None = None
    order_dir: str = Field(default="DESC")
    filter_column: str | None = None
    filter_value: str | None = None


class BrowseResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]
    total_rows: int


@app.post("/tables/{table}/browse", response_model=BrowseResponse)
def browse(table: str, body: BrowseRequest) -> BrowseResponse:
    try:
        where_sql = ""
        where_params: tuple[Any, ...] = ()
        if body.filter_column and body.filter_value and body.filter_value.strip():
            where_sql = f"`{body.filter_column}` LIKE ?"
            where_params = (f"%{body.filter_value.strip()}%",)
        total = count_rows(table=table, where_sql=where_sql, where_params=where_params)
        offset = (int(body.page) - 1) * int(body.page_size)
        result = fetch_table_page(
            table=table,
            where_sql=where_sql,
            where_params=where_params,
            order_by=body.order_by,
            order_dir=body.order_dir,
            limit=int(body.page_size),
            offset=int(offset),
        )
        return BrowseResponse(
            columns=result.columns,
            rows=[list(r) for r in result.rows],
            total_rows=int(total),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class ShowcaseRequest(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=50, ge=10, le=500)
    search: str = ""


class ShowcaseResponse(BaseModel):
    columns: list[str]
    rows: list[list[Any]]


@app.post("/demo/openflights/showcase", response_model=ShowcaseResponse)
def openflights_showcase(body: ShowcaseRequest) -> ShowcaseResponse:
    """Joined view: routes + airlines + airports (source/destination)."""
    try:
        offset = (int(body.page) - 1) * int(body.page_size)
        params: list[Any] = []
        where = ""
        if body.search.strip():
            s = f"%{body.search.strip()}%"
            where = (
                "WHERE al.name LIKE ? OR a_src.name LIKE ? OR a_dst.name LIKE ? "
                "OR a_src.iata LIKE ? OR a_dst.iata LIKE ?"
            )
            params = [s, s, s, s, s]
        sql = f"""
        SELECT
          r.id AS route_id,
          al.name AS airline,
          a_src.name AS source_airport,
          a_src.iata AS source_iata,
          a_dst.name AS destination_airport,
          a_dst.iata AS destination_iata,
          r.stops AS stops
        FROM routes r
        JOIN airlines al ON al.id = r.airline_id
        JOIN airports a_src ON a_src.id = r.source_airport_id
        JOIN airports a_dst ON a_dst.id = r.destination_airport_id
        {where}
        ORDER BY r.id DESC
        LIMIT {int(body.page_size)} OFFSET {int(offset)}
        """.strip()
        result = fetch_query(sql=sql, params=tuple(params))
        return ShowcaseResponse(columns=result.columns, rows=[list(r) for r in result.rows])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class MigrationPreviewResponse(BaseModel):
    title: str | None = None
    sql: str
    warnings: list[str] = []


class DropColumnPreviewRequest(BaseModel):
    table: str
    column: str


@app.post("/migrations/drop-column/preview", response_model=MigrationPreviewResponse)
def preview_drop_column(body: DropColumnPreviewRequest) -> MigrationPreviewResponse:
    try:
        sql = build_drop_column_statement(table_name=body.table, column_name=body.column)
        assert_statement_is_safe(sql)

        warnings: list[str] = []
        # FK warnings
        for fk in list_foreign_key_constraints():
            if fk.table_name == body.table and fk.column_name == body.column:
                warnings.append(f"Column is part of FK on `{fk.table_name}`: {fk.constraint_name}")
            if fk.referenced_table_name == body.table and fk.referenced_column_name == body.column:
                warnings.append(f"Column is referenced by FK from `{fk.table_name}`: {fk.constraint_name}")
        # Index warnings
        for idx in list_indexes():
            if idx.table_name == body.table and body.column in idx.columns and idx.index_name.upper() != "PRIMARY":
                warnings.append(f"Column is in index `{idx.index_name}` on `{idx.table_name}`")

        return MigrationPreviewResponse(title="Drop column", sql=sql + ";", warnings=sorted(set(warnings)))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class AddColumnPreviewRequest(BaseModel):
    table: str
    column_name: str
    sql_type: str
    is_nullable: bool = True
    default_value: str | None = None


@app.post("/migrations/add-column/preview", response_model=MigrationPreviewResponse)
def preview_add_column(body: AddColumnPreviewRequest) -> MigrationPreviewResponse:
    try:
        col = ColumnPlan(
            name=body.column_name.strip(),
            sql_type=(body.sql_type or "VARCHAR(255)").strip(),
            is_nullable=body.is_nullable,
            default=body.default_value.strip() if body.default_value and body.default_value.strip() else None,
        )
        sql = build_add_column_statement(table_name=body.table, column=col)
        assert_statement_is_safe(sql)
        return MigrationPreviewResponse(title="Add column", sql=sql + ";", warnings=[])
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class RenameColumnPreviewRequest(BaseModel):
    table: str
    old_column: str
    new_column: str
    sql_type: str
    is_nullable: bool = True


@app.post("/migrations/rename-column/preview", response_model=MigrationPreviewResponse)
def preview_rename_column(body: RenameColumnPreviewRequest) -> MigrationPreviewResponse:
    try:
        new_col = ColumnPlan(
            name=body.new_column.strip(),
            sql_type=(body.sql_type or "VARCHAR(255)").strip(),
            is_nullable=body.is_nullable,
        )
        sql = build_rename_column_statement(
            table_name=body.table,
            old_name=body.old_column.strip(),
            new_column=new_col,
        )
        assert_statement_is_safe(sql)
        warnings: list[str] = []
        for fk in list_foreign_key_constraints():
            if fk.table_name == body.table and fk.column_name == body.old_column:
                warnings.append(f"Column is part of FK: {fk.constraint_name}")
            if fk.referenced_table_name == body.table and fk.referenced_column_name == body.old_column:
                warnings.append(f"Column is referenced by FK from `{fk.table_name}`: {fk.constraint_name}")
        return MigrationPreviewResponse(title="Rename column", sql=sql + ";", warnings=sorted(set(warnings)))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class RenameTablePreviewRequest(BaseModel):
    old_table: str
    new_table: str


@app.post("/migrations/rename-table/preview", response_model=MigrationPreviewResponse)
def preview_rename_table(body: RenameTablePreviewRequest) -> MigrationPreviewResponse:
    try:
        sql = build_rename_table_statement(old_table_name=body.old_table, new_table_name=body.new_table)
        assert_statement_is_safe(sql)

        warnings: list[str] = []
        for fk in list_foreign_key_constraints():
            if fk.table_name == body.old_table or fk.referenced_table_name == body.old_table:
                warnings.append(
                    f"FK involved: {fk.table_name}.{fk.column_name} -> {fk.referenced_table_name}.{fk.referenced_column_name} ({fk.constraint_name})"
                )
        return MigrationPreviewResponse(title="Rename table", sql=sql + ";", warnings=sorted(set(warnings)))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class CreateIndexPreviewRequest(BaseModel):
    table: str
    index_name: str
    columns: list[str]
    is_unique: bool = False


@app.post("/migrations/index/create/preview", response_model=MigrationPreviewResponse)
def preview_create_index(body: CreateIndexPreviewRequest) -> MigrationPreviewResponse:
    try:
        sql = build_create_index_statement(
            table_name=body.table,
            index_name=body.index_name,
            columns=body.columns,
            is_unique=bool(body.is_unique),
        )
        assert_statement_is_safe(sql)
        return MigrationPreviewResponse(
            title="Create index",
            sql=sql + ";",
            warnings=[],
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DropIndexPreviewRequest(BaseModel):
    table: str
    index_name: str


@app.post("/migrations/index/drop/preview", response_model=MigrationPreviewResponse)
def preview_drop_index(body: DropIndexPreviewRequest) -> MigrationPreviewResponse:
    try:
        sql = build_drop_index_statement(table_name=body.table, index_name=body.index_name)
        assert_statement_is_safe(sql)
        return MigrationPreviewResponse(title="Drop index", sql=sql + ";", warnings=[])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class RelatedTablesResponse(BaseModel):
    tables: list[str]


@app.get("/migrations/drop-table/related-tables", response_model=RelatedTablesResponse)
def get_drop_table_related(table: str) -> RelatedTablesResponse:
    """Return tables that have foreign keys pointing at `table` (so the user can opt to drop them too)."""
    try:
        fks = list_foreign_key_constraints()
        related = sorted({fk.table_name for fk in fks if fk.referenced_table_name == table and fk.table_name != table})
        return RelatedTablesResponse(tables=related)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DropTablePreviewRequest(BaseModel):
    table: str
    also_drop: list[str] = []


@app.post("/migrations/drop-table/preview", response_model=MigrationPreviewResponse)
def preview_drop_table(body: DropTablePreviewRequest) -> MigrationPreviewResponse:
    try:
        tables_to_drop = [body.table] + [t for t in body.also_drop if t != body.table]
        drop_set = set(tables_to_drop)

        fks = list_foreign_key_constraints()
        external_refs: list[str] = []
        for fk in fks:
            if fk.referenced_table_name in drop_set and fk.table_name not in drop_set:
                external_refs.append(
                    f"`{fk.table_name}`.`{fk.column_name}` → `{fk.referenced_table_name}` (FK: {fk.constraint_name})"
                )

        lines = ["SET FOREIGN_KEY_CHECKS = 0;"]
        for t in tables_to_drop:
            lines.append(f"DROP TABLE IF EXISTS `{t}`;")
        lines.append("SET FOREIGN_KEY_CHECKS = 1;")
        sql = "\n".join(lines)

        warnings: list[str] = [
            f"This will permanently delete {len(tables_to_drop)} table(s) and all their data. This cannot be undone."
        ]
        for ref in sorted(set(external_refs)):
            warnings.append(f"Still referenced externally: {ref}")

        return MigrationPreviewResponse(title="Drop table", sql=sql, warnings=warnings)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class AiMigrationRequest(BaseModel):
    request: str


class AiMigrationResponse(BaseModel):
    title: str | None
    statements: list[str]


@app.post("/migrations/ai/generate", response_model=AiMigrationResponse)
def ai_generate_migration(body: AiMigrationRequest) -> AiMigrationResponse:
    try:
        plan = generate_migration_plan(request=body.request)
        for s in plan.statements:
            assert_statement_is_safe(s)
        _audit("generated", f"ai_migration: {plan.title or ''} ({len(plan.statements)} statements)")
        return AiMigrationResponse(title=plan.title, statements=plan.statements)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class MermaidLinksRequest(BaseModel):
    code: str
    theme: str = "light"  # light|dark


class MermaidLinksResponse(BaseModel):
    mermaid_live_edit_url: str
    svg_url: str
    png_url: str


@app.post("/diagram/links", response_model=MermaidLinksResponse)
def diagram_links(body: MermaidLinksRequest) -> MermaidLinksResponse:
    try:
        code = (body.code or "").strip()
        if not code:
            raise ValueError("code is required")
        theme = "dark" if (body.theme or "").lower().strip() == "dark" else "light"
        return MermaidLinksResponse(
            mermaid_live_edit_url=mermaid_live_edit_url(code=code),
            svg_url=mermaid_ink_url(code=code, kind="svg", theme=theme),
            png_url=mermaid_ink_url(code=code, kind="img", theme=theme),
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class InsertRequest(BaseModel):
    values: dict[str, Any]


class MutationResponse(BaseModel):
    affected_rows: int


@app.post("/tables/{table}/insert", response_model=MutationResponse)
def insert(table: str, body: InsertRequest) -> MutationResponse:
    try:
        n = insert_row(table=table, values=body.values or {})
        return MutationResponse(affected_rows=int(n))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class UpdateRequest(BaseModel):
    pk: dict[str, Any]
    values: dict[str, Any]


@app.post("/tables/{table}/update", response_model=MutationResponse)
def update(table: str, body: UpdateRequest) -> MutationResponse:
    try:
        n = update_row(table=table, pk=body.pk or {}, values=body.values or {})
        return MutationResponse(affected_rows=int(n))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class DeleteRequest(BaseModel):
    pk: dict[str, Any]


@app.post("/tables/{table}/delete", response_model=MutationResponse)
def delete(table: str, body: DeleteRequest) -> MutationResponse:
    try:
        n = delete_row(table=table, pk=body.pk or {})
        return MutationResponse(affected_rows=int(n))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class FkOptionsRequest(BaseModel):
    table: str
    id_column: str
    label_column: str | None = None
    search: str = ""
    limit: int = Field(default=50, ge=1, le=500)


class FkOptionsResponse(BaseModel):
    options: list[dict[str, Any]]


@app.post("/fk-options", response_model=FkOptionsResponse)
def fk_options(body: FkOptionsRequest) -> FkOptionsResponse:
    try:
        select_cols = f"`{body.id_column}`" if not body.label_column else f"`{body.id_column}`, `{body.label_column}`"
        where_sql = ""
        params: tuple[Any, ...] = ()
        if body.search.strip():
            if body.label_column:
                where_sql = f" WHERE `{body.id_column}` LIKE ? OR `{body.label_column}` LIKE ?"
                s = f"%{body.search.strip()}%"
                params = (s, s)
            else:
                where_sql = f" WHERE `{body.id_column}` LIKE ?"
                params = (f"%{body.search.strip()}%",)
        sql = f"SELECT {select_cols} FROM `{body.table}`{where_sql} LIMIT {int(body.limit)}"
        result = fetch_query(sql=sql, params=params)
        out = []
        for r in result.rows:
            if body.label_column:
                out.append({"id": r[0], "label": r[1]})
            else:
                out.append({"id": r[0], "label": None})
        return FkOptionsResponse(options=out)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class TableExportRequest(BaseModel):
    order_by: str | None = None
    order_dir: str = Field(default="DESC")
    filter_column: str | None = None
    filter_value: str | None = None
    max_rows: int = Field(default=100000, ge=1, le=1000000)


@app.post("/tables/{table}/export-csv")
def export_table_csv(table: str, body: TableExportRequest):
    try:
        where_sql = ""
        where_params: tuple[Any, ...] = ()
        if body.filter_column and body.filter_value and body.filter_value.strip():
            where_sql = f" WHERE `{body.filter_column}` LIKE ?"
            where_params = (f"%{body.filter_value.strip()}%",)
        order_clause = ""
        if body.order_by:
            dir_ = "ASC" if (body.order_dir or "").upper() == "ASC" else "DESC"
            order_clause = f" ORDER BY `{body.order_by}` {dir_}"
        sql = f"SELECT * FROM `{table}`{where_sql}{order_clause} LIMIT {int(body.max_rows)}"
        result = fetch_query(sql=sql, params=where_params)
        data = query_result_to_csv_bytes(result)
        _audit("executed", f"table_export_csv: {table} ({len(result.rows)} rows)")
        return {
            "filename": f"{table}.csv",
            "mime": "text/csv",
            "data_base64": __import__("base64").b64encode(data).decode("ascii"),
        }
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


class CsvImportResponse(BaseModel):
    inserted_rows: int


@app.post("/tables/{table}/import-csv", response_model=CsvImportResponse)
async def import_csv(table: str, file: UploadFile, delimiter: str = ",", max_rows: int = 50000) -> CsvImportResponse:
    try:
        csv_bytes = await file.read()
        header = sniff_csv_header(csv_bytes=csv_bytes, delimiter=delimiter)
        # default mapping: identity intersection
        table_cols = [c.column_name for c in list_columns() if c.table_name == table]
        mapping = {c: c for c in table_cols if c in header}
        res = import_csv_to_table_mapped(
            table_name=table,
            csv_bytes=csv_bytes,
            delimiter=delimiter,
            max_rows=int(max_rows),
            mapping=mapping,
        )
        return CsvImportResponse(inserted_rows=int(res.inserted_rows))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/tables/{table}/import-csv-mapped", response_model=CsvImportResponse)
async def import_csv_mapped(
    table: str,
    file: UploadFile,
    mapping_json: str = Form(...),
    delimiter: str = Form(","),
    max_rows: int = Form(50000),
) -> CsvImportResponse:
    try:
        import json

        mapping = json.loads(mapping_json)
        if not isinstance(mapping, dict):
            raise ValueError("mapping_json must be a JSON object")
        csv_bytes = await file.read()
        res = import_csv_to_table_mapped(
            table_name=table,
            csv_bytes=csv_bytes,
            delimiter=delimiter,
            max_rows=int(max_rows),
            mapping={str(k): str(v) for k, v in mapping.items()},
        )
        return CsvImportResponse(inserted_rows=int(res.inserted_rows))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/diagram", response_model=DiagramResponse)
def diagram(body: DiagramRequest) -> DiagramResponse:
    try:
        code = (
            build_mermaid_er_diagram(focus_tables=body.focus_tables, depth=int(body.depth))
            if body.focus_tables
            else build_mermaid_er_diagram()
        )
        return DiagramResponse(code=code)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=str(exc)) from exc

