"""A small bundled OpenFlights sample for offline demos.

We keep the sample tiny so the repo stays lightweight, but still relational enough
to show joins + foreign keys.

Source fields follow OpenFlights CSV conventions:
- airports.dat: Airport ID, Name, City, Country, IATA, ICAO, Lat, Lon, Altitude, Timezone, DST, TZ, Type, Source
- airlines.dat: Airline ID, Name, Alias, IATA, ICAO, Callsign, Country, Active
- routes.dat: Airline, Airline ID, Source airport, Source airport ID, Destination airport,
              Destination airport ID, Codeshare, Stops, Equipment
"""

from __future__ import annotations


AIRPORTS = [
    # id, name, city, country, iata, icao, lat, lon
    (1, "Kuala Lumpur International Airport", "Sepang", "Malaysia", "KUL", "WMKK", 2.7456, 101.7099),
    (2, "Singapore Changi Airport", "Singapore", "Singapore", "SIN", "WSSS", 1.3644, 103.9915),
    (3, "Tokyo Haneda International Airport", "Tokyo", "Japan", "HND", "RJTT", 35.5523, 139.7798),
    (4, "London Heathrow Airport", "London", "United Kingdom", "LHR", "EGLL", 51.4700, -0.4543),
    (5, "Dubai International Airport", "Dubai", "United Arab Emirates", "DXB", "OMDB", 25.2532, 55.3657),
]


AIRLINES = [
    # id, name, iata, icao, country, active
    (1, "Malaysia Airlines", "MH", "MAS", "Malaysia", True),
    (2, "Singapore Airlines", "SQ", "SIA", "Singapore", True),
    (3, "Japan Airlines", "JL", "JAL", "Japan", True),
    (4, "British Airways", "BA", "BAW", "United Kingdom", True),
    (5, "Emirates", "EK", "UAE", "United Arab Emirates", True),
]


ROUTES = [
    # airline_id, src_airport_id, dst_airport_id, stops
    (1, 1, 2, 0),
    (2, 2, 1, 0),
    (5, 5, 4, 0),
    (4, 4, 3, 0),
    (3, 3, 2, 0),
    (2, 2, 5, 0),
]

