"""Load OpenFlights data from the official MariaDB/openflights repo (subset).

We clone the repo locally (shallow) and parse:
- data/airports.dat
- data/airlines.dat
- data/routes.dat

To keep demo fast and safe:
- we load a configurable subset size
- we only insert routes that satisfy foreign keys for the loaded airports/airlines
"""

from __future__ import annotations

import csv
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

from core.db_executor import execute_script_statements, get_connection
from demo.demo_loader import create_openflights_schema


@dataclass(frozen=True)
class OfficialLoadCounts:
    airports: int
    airlines: int
    routes: int
    elapsed_s: float


def ensure_repo(*, repo_dir: Path) -> None:
    repo_dir.parent.mkdir(parents=True, exist_ok=True)
    if (repo_dir / ".git").exists():
        return

    # Shallow clone to keep it fast.
    import subprocess

    subprocess.check_call(
        ["git", "clone", "--depth", "1", "https://github.com/MariaDB/openflights", str(repo_dir)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _iter_dat_rows(path: Path) -> Iterable[list[str]]:
    # OpenFlights .dat files are CSV with quotes.
    with path.open("r", encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.reader(f, delimiter=",", quotechar='"', escapechar="\\")
        for row in reader:
            if not row:
                continue
            yield row


def load_official_subset(
    *,
    repo_dir: Path,
    airport_limit: int = 5000,
    airline_limit: int = 3000,
    route_limit: int = 20000,
    reset_first: bool = False,
    disable_fk_checks: bool = False,
    on_progress: Callable[[str], None] | None = None,
) -> OfficialLoadCounts:
    start = time.time()
    ensure_repo(repo_dir=repo_dir)

    if reset_first:
        from core.maintenance import reset_all_tables

        reset_all_tables(disable_fk_checks=disable_fk_checks)

    execute_script_statements(create_openflights_schema())

    data_dir = repo_dir / "data"
    airports_path = data_dir / "airports.dat"
    airlines_path = data_dir / "airlines.dat"
    routes_path = data_dir / "routes.dat"

    if on_progress:
        on_progress("Reading airports…")

    airports: list[tuple[int, str, str, str, str | None, str | None, float, float]] = []
    airport_ids: set[int] = set()
    used_airport_iata: set[str] = set()
    for row in _iter_dat_rows(airports_path):
        if len(airports) >= airport_limit:
            break
        try:
            airport_id = int(row[0])
            name = row[1]
            city = row[2]
            country = row[3]
            def _clean(code: str | None) -> str | None:
                if not code:
                    return None
                code = code.strip()
                if code in {r"\N", "N", "\\N", "-", "0"}:
                    return None
                return code

            iata = _clean(row[4] if len(row) > 4 else None)
            icao = _clean(row[5] if len(row) > 5 else None)
            lat = float(row[6])
            lon = float(row[7])
        except Exception:
            continue
        if iata is not None:
            if iata in used_airport_iata:
                iata = None
            else:
                used_airport_iata.add(iata)
        airports.append((airport_id, name, city, country, iata, icao, lat, lon))
        airport_ids.add(airport_id)

    if on_progress:
        on_progress("Reading airlines…")

    airlines: list[tuple[int, str, str | None, str | None, str, bool]] = []
    airline_ids: set[int] = set()
    used_airline_iata: set[str] = set()
    for row in _iter_dat_rows(airlines_path):
        if len(airlines) >= airline_limit:
            break
        try:
            airline_id = int(row[0])
            name = row[1]
            iata = _clean(row[3] if len(row) > 3 else None)
            icao = _clean(row[4] if len(row) > 4 else None)
            country = row[6] if len(row) > 6 and row[6] not in {r"\N", "N", "\\N"} else ""
            active_raw = row[7] if len(row) > 7 else "N"
            is_active = (active_raw or "").strip().upper() == "Y"
        except Exception:
            continue
        if iata is not None:
            if iata in used_airline_iata:
                iata = None
            else:
                used_airline_iata.add(iata)
        airlines.append((airline_id, name, iata, icao, country, is_active))
        airline_ids.add(airline_id)

    if on_progress:
        on_progress("Reading routes…")

    routes: list[tuple[int, int, int, int]] = []
    for row in _iter_dat_rows(routes_path):
        if len(routes) >= route_limit:
            break
        # routes.dat format: airline, airline_id, src, src_id, dst, dst_id, codeshare, stops, equipment
        try:
            airline_id = int(row[1]) if row[1] and row[1] != r"\N" else -1
            src_id = int(row[3]) if row[3] and row[3] != r"\N" else -1
            dst_id = int(row[5]) if row[5] and row[5] != r"\N" else -1
            stops = int(row[7]) if len(row) > 7 and row[7] and row[7] != r"\N" else 0
        except Exception:
            continue

        if airline_id not in airline_ids:
            continue
        if src_id not in airport_ids or dst_id not in airport_ids:
            continue
        routes.append((airline_id, src_id, dst_id, stops))

    if on_progress:
        on_progress("Inserting into MariaDB…")

    conn = get_connection()
    conn.autocommit = False
    try:
        cur = conn.cursor()
        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 0")

        cur.executemany(
            """
            INSERT INTO airports (id, name, city, country, iata, icao, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            airports,
        )
        a_count = cur.rowcount

        cur.executemany(
            """
            INSERT INTO airlines (id, name, iata, icao, country, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            airlines,
        )
        al_count = cur.rowcount

        cur.executemany(
            """
            INSERT INTO routes (airline_id, source_airport_id, destination_airport_id, stops)
            VALUES (?, ?, ?, ?)
            """,
            routes,
        )
        r_count = cur.rowcount

        if disable_fk_checks:
            cur.execute("SET FOREIGN_KEY_CHECKS = 1")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

    elapsed = time.time() - start
    if on_progress:
        on_progress(f"Done in {elapsed:.2f}s. airports={a_count}, airlines={al_count}, routes={r_count}")

    return OfficialLoadCounts(airports=a_count, airlines=al_count, routes=r_count, elapsed_s=elapsed)

