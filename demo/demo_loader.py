"""Instant Demo Mode loaders."""

from __future__ import annotations

from core.db_executor import execute_script_statements, get_connection
from demo.openflights_sample import AIRLINES, AIRPORTS, ROUTES


def create_openflights_schema() -> list[str]:
    # Keep names simple and consistent with CRUD UI.
    return [
        """
        CREATE TABLE IF NOT EXISTS `airports` (
          `id` INT NOT NULL,
          `name` VARCHAR(255) NOT NULL,
          `city` VARCHAR(255) NOT NULL,
          `country` VARCHAR(255) NOT NULL,
          `iata` VARCHAR(10) NULL,
          `icao` VARCHAR(10) NULL,
          `latitude` DECIMAL(10,6) NOT NULL,
          `longitude` DECIMAL(10,6) NOT NULL,
          PRIMARY KEY (`id`),
          UNIQUE KEY `ux_airports_iata` (`iata`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """.strip(),
        """
        CREATE TABLE IF NOT EXISTS `airlines` (
          `id` INT NOT NULL,
          `name` VARCHAR(255) NOT NULL,
          `iata` VARCHAR(10) NULL,
          `icao` VARCHAR(10) NULL,
          `country` VARCHAR(255) NOT NULL,
          `is_active` BOOLEAN NOT NULL,
          PRIMARY KEY (`id`),
          UNIQUE KEY `ux_airlines_iata` (`iata`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """.strip(),
        """
        CREATE TABLE IF NOT EXISTS `routes` (
          `id` INT NOT NULL AUTO_INCREMENT,
          `airline_id` INT NOT NULL,
          `source_airport_id` INT NOT NULL,
          `destination_airport_id` INT NOT NULL,
          `stops` INT NOT NULL DEFAULT 0,
          PRIMARY KEY (`id`),
          CONSTRAINT `fk_routes_airline_id` FOREIGN KEY (`airline_id`) REFERENCES `airlines` (`id`),
          CONSTRAINT `fk_routes_source_airport_id` FOREIGN KEY (`source_airport_id`) REFERENCES `airports` (`id`),
          CONSTRAINT `fk_routes_destination_airport_id` FOREIGN KEY (`destination_airport_id`) REFERENCES `airports` (`id`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """.strip(),
    ]


def load_openflights_sample_data() -> dict[str, int]:
    """Bulk insert bundled sample data.

    Returns a dict with inserted row counts per table.
    """
    counts = {"airports": 0, "airlines": 0, "routes": 0}
    conn = get_connection()
    conn.autocommit = False
    try:
        cur = conn.cursor()

        cur.executemany(
            """
            INSERT INTO airports (id, name, city, country, iata, icao, latitude, longitude)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            AIRPORTS,
        )
        counts["airports"] = cur.rowcount

        cur.executemany(
            """
            INSERT INTO airlines (id, name, iata, icao, country, is_active)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            AIRLINES,
        )
        counts["airlines"] = cur.rowcount

        cur.executemany(
            """
            INSERT INTO routes (airline_id, source_airport_id, destination_airport_id, stops)
            VALUES (?, ?, ?, ?)
            """,
            ROUTES,
        )
        counts["routes"] = cur.rowcount

        conn.commit()
        return counts
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def run_openflights_demo(*, reset_first: bool = False, disable_fk_checks: bool = False) -> dict[str, int]:
    """Create schema + load sample data. Optionally resets DB first."""
    if reset_first:
        from core.maintenance import reset_all_tables

        reset_all_tables(disable_fk_checks=disable_fk_checks)

    execute_script_statements(create_openflights_schema())
    return load_openflights_sample_data()

