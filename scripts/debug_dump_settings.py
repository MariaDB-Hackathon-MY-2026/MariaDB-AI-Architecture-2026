from __future__ import annotations

import os
from pathlib import Path

import mariadb
from dotenv import load_dotenv


def main() -> None:
    load_dotenv(dotenv_path=Path(__file__).resolve().parents[1] / ".env")

    cfg = {
        "host": os.getenv("MARIADB_HOST", "127.0.0.1"),
        "port": int(os.getenv("MARIADB_PORT", "3306")),
        "user": os.getenv("MARIADB_USER", "root"),
        "password": os.getenv("MARIADB_PASSWORD", "") or "",
        "database": os.getenv("MARIADB_DATABASE", "mariadb_ai_architect"),
    }
    print({"host": cfg["host"], "port": cfg["port"], "user": cfg["user"], "database": cfg["database"]})

    conn = mariadb.connect(**cfg)
    try:
        cur = conn.cursor()
        cur.execute("SHOW TABLES LIKE 'app_user_settings'")
        print({"has_app_user_settings": cur.fetchone() is not None})

        cur.execute(
            "SELECT user_id, mariadb_host, mariadb_port, mariadb_user, mariadb_database, updated_at "
            "FROM app_user_settings ORDER BY updated_at DESC LIMIT 10"
        )
        rows = cur.fetchall()
        print({"rows": rows})
    finally:
        conn.close()


if __name__ == "__main__":
    main()

