"""Feature engineering schema and transparent rule-based baseline for Objective 3."""

from __future__ import annotations

from typing import Dict, List, Tuple

import pandas as pd

from shared.configuration import NAGRIK_CATEGORIES, SEVERITY_LEVELS

SEVERITY_ORD_MAP = {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}

TRAINING_SCHEMA_COLUMNS = [
    "severity",
    "category",
    "unique_supports",
    "age_hours",
    "locality",
    "duplicate_count",
    "ward_avg_res_hours",
    "target_priority",
]


def build_feature_frame(records: List[Dict[str, object]]) -> pd.DataFrame:
    """Convert raw complaint dicts into a structured DataFrame for sklearn pipelines."""
    rows = []
    for rec in records:
        sev = str(rec.get("severity", "Medium"))
        cat = str(rec.get("category", "Potholes"))
        supports = int(rec.get("unique_supports", 0))
        age_hours = float(rec.get("age_hours", 0.0))
        duplicate_count = int(rec.get("duplicate_count", 0))
        ward_avg_res_hours = float(rec.get("ward_avg_res_hours", 24.0))
        locality = str(rec.get("locality", "General"))

        rows.append(
            {
                "severity_ord": SEVERITY_ORD_MAP.get(sev, 2),
                "category": cat if cat in NAGRIK_CATEGORIES else "Potholes",
                "unique_supports": max(0, supports),
                "age_hours": max(0.0, age_hours),
                "duplicate_count": max(0, duplicate_count),
                "ward_avg_res_hours": max(1.0, ward_avg_res_hours),
                "locality": locality,
            }
        )
    return pd.DataFrame(rows)


def compute_rule_based_priority(record: Dict[str, object]) -> Dict[str, object]:
    """Transparent deterministic baseline used strictly when labelled historical ML model is not yet trained."""
    sev = str(record.get("severity", "Medium"))
    cat = str(record.get("category", "Potholes"))
    # Note: unverified citizen votes are capped and never treated as ground truth
    supports = min(20, max(0, int(record.get("unique_supports", 0))))
    age_hours = max(0.0, float(record.get("age_hours", 0.0)))
    duplicate_count = max(0, int(record.get("duplicate_count", 0)))
    ward_avg_res = max(1.0, float(record.get("ward_avg_res_hours", 24.0)))

    sev_pts = {"Low": 15, "Medium": 35, "High": 60, "Critical": 80}.get(sev, 35)
    cat_pts = {
        "Water leakage": 10,
        "Broken streetlights": 8,
        "Potholes": 7,
        "Garbage accumulation": 5,
    }.get(cat, 6)
    support_pts = min(8.0, supports * 0.8)
    dup_pts = min(8.0, duplicate_count * 2.0)
    age_pts = min(6.0, age_hours / 12.0)
    sla_pressure = min(4.0, ward_avg_res / 24.0)

    raw_score = sev_pts + cat_pts + support_pts + dup_pts + age_pts + sla_pressure
    score = int(round(max(0.0, min(100.0, raw_score))))

    if score >= 80:
        tier = "Critical"
    elif score >= 60:
        tier = "High"
    elif score >= 35:
        tier = "Medium"
    else:
        tier = "Low"

    factors: List[str] = [
        f"Confirmed severity ({sev}): +{sev_pts} pts",
        f"Infrastructure risk class ({cat}): +{cat_pts} pts",
        f"Duplicate reports ({duplicate_count}): +{dup_pts:.1f} pts",
        f"Unique verified supports (capped {supports}): +{support_pts:.1f} pts",
        f"Complaint age ({age_hours:.1f}h): +{age_pts:.1f} pts",
    ]

    return {
        "priority_score": score,
        "priority_tier": tier,
        "influencing_factors": factors,
        "scoring_source": "rule_based_baseline",
        "lifecycle_state": "implemented_not_trained",
        "ml_model_trained": False,
        "note": (
            "ML priority model not yet trained on historical labelled data; using transparent rule-based baseline. "
            "Unverified citizen votes are bounded and not treated as ground truth."
        ),
    }
