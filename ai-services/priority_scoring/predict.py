"""Inference pipeline for NAGRIK Objective 3 priority scoring."""

from __future__ import annotations

from typing import Dict, List

import joblib

from priority_scoring.feature_engineering import (
    build_feature_frame,
    compute_rule_based_priority,
)
from shared.configuration import CONFIG

TIER_WEIGHTS = {"Low": 20.0, "Medium": 45.0, "High": 75.0, "Critical": 96.0}
_PIPELINE_CACHE: Dict[str, object] = {}


def predict_priority(record: Dict[str, object]) -> Dict[str, object]:
    if not CONFIG.priority_model_path.exists():
        return compute_rule_based_priority(record)

    if "pipeline" not in _PIPELINE_CACHE:
        _PIPELINE_CACHE["pipeline"] = joblib.load(CONFIG.priority_model_path)

    pipeline = _PIPELINE_CACHE["pipeline"]
    X = build_feature_frame([record])
    proba = pipeline.predict_proba(X)[0]  # type: ignore[attr-defined]
    classes = list(pipeline.classes_)  # type: ignore[attr-defined]

    expected_score = sum(
        float(p) * TIER_WEIGHTS.get(str(cls), 50.0) for cls, p in zip(classes, proba)
    )
    score = int(round(max(0.0, min(100.0, expected_score))))
    predicted_tier = str(pipeline.predict(X)[0])  # type: ignore[attr-defined]

    prep = pipeline.named_steps["prep"]  # type: ignore[attr-defined]
    clf = pipeline.named_steps["clf"]  # type: ignore[attr-defined]
    names = list(prep.get_feature_names_out())
    importances = getattr(clf, "feature_importances_", [])
    top_factors: List[str] = [
        f"{name.replace('num__', '').replace('cat__', '')} (importance {val:.2f})"
        for name, val in sorted(zip(names, importances), key=lambda kv: kv[1], reverse=True)[:4]
    ]

    return {
        "priority_score": score,
        "priority_tier": predicted_tier,
        "influencing_factors": top_factors,
        "scoring_source": "sklearn_ml",
        "lifecycle_state": "deployed_active",
        "ml_model_trained": True,
        "class_probabilities": {
            str(cls): round(float(p), 4) for cls, p in zip(classes, proba)
        },
    }
