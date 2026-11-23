"""GPS coordinate validation for resolution verification."""

from __future__ import annotations

from typing import Dict

from duplicate_detection.geographic_matching import haversine_distance_meters
from shared.configuration import CONFIG


def validate_resolution_gps(
    original_lat: float,
    original_lon: float,
    resolution_lat: float,
    resolution_lon: float,
) -> Dict[str, object]:
    """Compare browser-captured resolution coordinates with original complaint location."""
    distance_m = round(
        haversine_distance_meters(original_lat, original_lon, resolution_lat, resolution_lon),
        2,
    )
    threshold = CONFIG.gps_suspicious_distance_meters

    if distance_m <= 60.0:
        status = "GPS Verified (On-Site)"
        suspicious = False
    elif distance_m <= threshold:
        status = "GPS Acceptable (Minor Offset)"
        suspicious = False
    else:
        status = f"Suspiciously Distant ({distance_m}m > {threshold}m limit)"
        suspicious = True

    return {
        "distance_meters": distance_m,
        "threshold_meters": threshold,
        "gps_suspicious": suspicious,
        "gps_status": status,
    }
