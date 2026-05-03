# MariaDB-AI-Architecture-2026

<p align="center">
  <img src="asset/mariadb-logo.svg" alt="MariaDB AI Architect" width="320" />
</p>

<h1 align="center">MariaDB AI Architect</h1>

<p align="center">
  AI-powered database workspace — design schemas, run migrations, browse data, and visualize relationships, all in plain English.
</p>

<p align="center">
  <img src="asset/badge-mariadb.svg" alt="MariaDB" />
  &nbsp;
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=flat&logo=python&logoColor=white" alt="Python" />
  &nbsp;
  <img src="https://img.shields.io/badge/FastAPI-0.111-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  &nbsp;
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=black" alt="React" />
  &nbsp;
  <img src="https://img.shields.io/badge/Ollama-local_LLM-black?style=flat" alt="Ollama" />
</p>

📖 **Documentation:** [docs-maria-db-ai.vercel.app](https://docs-maria-db-ai.vercel.app)

---

## What It Does

MariaDB AI Architect connects to your existing MariaDB server and lets you manage it through a modern web UI. Every operation that normally requires writing SQL can be described in plain English — the AI generates, previews, and executes the statement only after you confirm.

```
"Create a school database with students, courses, and enrollments"
        ↓  AI generates CREATE TABLE + FK statements
        ↓  Visual editor lets you tweak before running
        ↓  Execute → schema is live in MariaDB
```

---

## Demos

### Schema Generator
Describe any database in plain English — the AI generates a full relational schema with tables, types, foreign keys, and indexes. Tweak it visually before executing.

![Schema Generator Demo](asset/MariaDB%20Schema%20Generator%20Demo.gif)

### Query Assistant
Ask a question in plain English — the AI writes a safe, read-only SELECT query, runs it, and shows paginated results you can export as CSV.

![Query Assistant Demo](asset/MariaDB%20Query%20Assistance.gif)

### ER Diagram
Auto-generated live Mermaid ER diagram from your actual schema. Click any table to explore its FK relationships and export as SVG or PNG.

![ER Diagram Demo](asset/MariaDB%20ER%20Diagram%20Demo.gif)

### Data Manager — Smart Write
Describe a data change in plain English — the AI generates a safe DML statement, previews the affected rows, and executes only after you confirm.

![Data Manager AI Demo](asset/MariaDB%20Data%20Manager%20AI%20Demo.gif)

### Demo Mode — OpenFlights Dataset
Load real airport, airline, and route data in one click. Instant sample or full dataset with configurable row limits, running as a live background job.

![Demo Mode Flights](asset/MariaDB%20Demo%20Flights.jpg)

### Audit Log
Every generated and executed SQL statement is logged with timestamp and kind. Search, filter, and expand any entry.

![Audit Log Demo](asset/MariaDB%20Audit%20Log%20Demo%20.jpg)

### Settings
Configure your MariaDB connection and Ollama model per user. Test connectivity with one click — settings are encrypted and stored per account.

![Settings Demo](asset/MariaDB%20Demo%20Settings%20.jpg)

---

## Modules

| Module | What it does |
|--------|-------------|
| **Schema Generator** | Describe a system in plain English → AI generates a full relational schema (tables, columns, types, FKs, indexes). Visual editor to add/edit/remove before executing. Download as `.sql`. |
| **ER Diagram** | Auto-generates a live Mermaid ER diagram from your actual schema. Click any table to explore its FK relationships. Export as SVG, PNG, or open in Mermaid Live. |
| **Migration Assistant** | Two modes: AI (describe a change in English → safe DDL preview) and Manual Tools (add/rename/drop columns, create/drop indexes — all with live SQL preview + warnings). |
| **Data Manager** | Full CRUD browser for every table. Inline edit, delete with confirmation. CSV import with visual column mapping. CSV export. Smart Write: describe a data change in plain English → preview affected rows → confirm. |
| **Query Assistant** | Ask a question in plain English → AI generates a safe, read-only SELECT → results in a paginated table → export as CSV. |
| **Demo Mode** | Load the OpenFlights dataset (airports, airlines, routes) in one click. Quick Sample (instant, 5 rows each) or Official Dataset (real data, configurable row limits). Runs as a background job with live progress. |
| **Schema History** | Save snapshots of your live schema at any point. Diff any two snapshots to see exactly what tables, columns, and FKs changed. |
| **Audit Log** | Every generated and executed SQL statement is logged with timestamp and kind. Search, filter, and expand entries. |
| **Export Database** | Download your entire database as a `.sql` file — DDL + INSERT data for every table, ready for restore in phpMyAdmin, DBeaver, or the CLI. |

---

## Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| [MariaDB](https://mariadb.org/download/) | 10.6+ | Your existing DB server |
| Python | 3.11+ | Backend runtime |
| Node.js | 20+ | Frontend build |
| [Ollama](https://ollama.com/) | latest | Local LLM inference — free, no API key |

> Any model available in Ollama works. `qwen2.5-coder:7b` is the recommended default — good at SQL, runs on 8 GB RAM.

---

## Quick Start

### 1 — MariaDB

Create the application database (the app creates its own internal tables automatically on first start):

```sql
CREATE DATABASE IF NOT EXISTS mariadb_ai_architect
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 2 — Ollama

```bash
ollama pull qwen2.5-coder:7b
```

### 3 — Python backend

```bash
# Create and activate virtual environment
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Copy and fill in your credentials
cp .env.example .env

# Start the API
uvicorn backend.main:app --reload
```

API runs at `http://localhost:8000`.

### 4 — React frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`.

---

## First Run

1. Open `http://localhost:5173` — register an account.
2. Go to **Settings** — enter your MariaDB host/port/user/password/database and Ollama URL/model.
3. Click **Test MariaDB** and **Test Ollama** to confirm both are reachable.
4. Go to **Demo Mode** and load the OpenFlights dataset to see everything in action immediately.
5. Try **Schema Generator** to design your own database from a plain-English description.

---

## Environment Variables

All values are set in `.env` (copy from `.env.example`):

```env
# MariaDB connection
MARIADB_HOST=127.0.0.1
MARIADB_PORT=3306
MARIADB_USER=root
MARIADB_PASSWORD=
MARIADB_DATABASE=mariadb_ai_architect

# Ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5-coder:7b

# App secret — used to encrypt stored DB passwords. Change before deploying.
APP_SECRET_KEY=dev-secret-change-me
```

Per-user MariaDB and Ollama settings can also be saved through the **Settings** page — they override the `.env` values for that user's session.

---

## Project Layout

```
backend/
  main.py                   FastAPI app — auth, all API routes, background jobs

core/
  db_executor.py            MariaDB connection + ContextVar per-user config
  introspect.py             Live schema inspection (tables, columns, FKs, indexes)
  crud.py                   Generic fetch / insert / update / delete
  schema_generator.py       AI schema plan generation
  schema_types.py           SchemaPlan / TablePlan / ColumnPlan dataclasses
  sql_builder.py            DDL generation from SchemaPlan
  er_visualizer.py          Deterministic ERD builder from live schema
  query_assistant.py        AI read-only SELECT generation
  write_assistant.py        AI INSERT / UPDATE / DELETE with preview
  migration_assistant.py    AI ALTER / INDEX SQL generation
  diagram_assistant.py      AI Mermaid diagram generation
  alter_builder.py          Manual ALTER TABLE statement builders
  export_import.py          CSV export/import + full SQL dump
  maintenance.py            TRUNCATE, reseed auto_increment, rebuild sequential IDs
  sql_safety.py             DDL allow-list guard
  sql_safety_readonly.py    SELECT-only guard
  sql_safety_write.py       DML-only guard

demo/
  demo_loader.py                    Bundled 5-row OpenFlights sample
  openflights_official_loader.py    Real OpenFlights data (cloned from GitHub)

utils/
  audit_log.py              ISO timestamp helper
  mermaid_links.py          mermaid.ink / mermaid.live URL builders

frontend/src/
  pages/                    One React page per module (11 pages)
  components/               AppShell, MermaidView, StatusBanner, Skeleton, EmptyState
  context/AuthContext.tsx   User auth state (login / register / logout)
  lib/api.ts                Typed fetch wrapper + all TypeScript interfaces
```

---

## Tech Stack

**Backend**
- Python 3.11+ · FastAPI · Uvicorn
- MariaDB Connector/Python (`mariadb` package)
- Ollama via HTTP (`httpx`)
- `passlib` + `cryptography` for auth and credential encryption
- Per-user ContextVar config — each request runs with its own DB connection

**Frontend**
- React 19 · TypeScript · Vite
- Tailwind CSS v4
- React Router v7
- Lucide Icons
- Mermaid (client-side diagram rendering)

---

## Security

- **SQL injection**: all user-provided identifiers (table names, column names) are backtick-quoted; parameterised queries for all values; DDL/DML statements validated through allow-list guards (`sql_safety.py`, `sql_safety_readonly.py`, `sql_safety_write.py`) before execution.
- **Credential storage**: MariaDB passwords saved to the app database are encrypted with Fernet (AES-128-CBC) using a key derived from `APP_SECRET_KEY`. Change this value before any shared deployment.
- **Session auth**: HTTP-only cookie sessions with configurable expiry. Passwords hashed with `pbkdf2_sha256`.
- **AI output**: every SQL statement generated by the LLM is passed through the same safety guards before preview or execution — the LLM cannot bypass validation.

---

## AI Model Options

The application is model-agnostic — any model served by Ollama works:

| Model | RAM | Notes |
|-------|-----|-------|
| `qwen2.5-coder:7b` | 8 GB | Default. Good SQL quality, fast on CPU. |
| `qwen2.5-coder:14b` | 16 GB | Better on complex multi-table schemas. |
| `codellama:13b` | 16 GB | Alternative if Qwen is unavailable. |
| `llama3.1:8b` | 8 GB | General purpose; SQL quality varies. |

Change the model any time in **Settings** without restarting the server.

---

## Author

| | |
|---|---|
| **Name** | Mohd Hakim |
| **University** | University Poly-Tech Malaysia (UPTM) |
| **Email** | kl2512020850@student.uptm.edu.my |
| **GitHub** | [@MohdHakimFz](https://github.com/MohdHakimFz) |
