"""Haversine geographical filtering for nearby municipal complaints."""

from __future__ import annotations

import math
from typing import Dict, List


EARTH_RADIUS_METERS = 6_371_000.0


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance in meters between two WGS84 coordinates."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * (math.sin(d_lambda / 2.0) ** 2)
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return EARTH_RADIUS_METERS * c


def filter_nearby_complaints(
    target_lat: float,
    target_lon: float,
    candidates: List[Dict[str, object]],
    radius_meters: float = 100.0,
) -> List[Dict[str, object]]:
    """Return candidates within radius_meters sorted by ascending Haversine distance."""
    nearby: List[Dict[str, object]] = []
    for item in candidates:
        c_lat = float(item["latitude"])
        c_lon = float(item["longitude"])
        dist = haversine_distance_meters(target_lat, target_lon, c_lat, c_lon)
        if dist <= radius_meters:
            enriched = dict(item)
            enriched["distance_meters"] = round(dist, 2)
            nearby.append(enriched)
    nearby.sort(key=lambda r: float(r["distance_meters"]))
    return nearby
