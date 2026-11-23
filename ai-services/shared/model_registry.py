"""Model lifecycle registry tracking implemented, trained/evaluated, and deployed states."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Literal

from .configuration import CONFIG

LifecycleState = Literal[
    "implemented_not_trained",
    "trained_evaluated",
    "deployed_active",
]


def _read_json_if_exists(path: Path) -> Dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def get_classification_status() -> Dict[str, Any]:
    ckpt_exists = CONFIG.classification_checkpoint_path.exists()
    meta = _read_json_if_exists(CONFIG.classification_metadata_path)
    eval_report = _read_json_if_exists(CONFIG.classification_eval_path)

    if ckpt_exists and eval_report is not None:
        state: LifecycleState = "deployed_active"
    elif ckpt_exists:
        state = "trained_evaluated"
    else:
        state = "implemented_not_trained"

    return {
        "objective": "Objective 1: Photo-Based Civic Issue & Severity Classification",
        "lifecycle_state": state,
        "checkpoint_present": ckpt_exists,
        "checkpoint_path": str(CONFIG.classification_checkpoint_path),
        "metadata": meta,
        "evaluation_present": eval_report is not None,
        "training_pending_reason": None
        if ckpt_exists
        else "No trained weights found. Populate ai-services/datasets/civic_issues/ and run classification/train.py.",
    }


def get_priority_status() -> Dict[str, Any]:
    model_exists = CONFIG.priority_model_path.exists()
    meta = _read_json_if_exists(CONFIG.priority_metadata_path)
    eval_report = _read_json_if_exists(CONFIG.priority_eval_path)

    if model_exists and eval_report is not None:
        state: LifecycleState = "deployed_active"
    elif model_exists:
        state = "trained_evaluated"
    else:
        state = "implemented_not_trained"

    return {
        "objective": "Objective 3: ML-Based Priority Scoring",
        "lifecycle_state": state,
        "model_present": model_exists,
        "model_path": str(CONFIG.priority_model_path),
        "metadata": meta,
        "evaluation_present": eval_report is not None,
        "fallback_mode": "transparent_rule_based_baseline" if not model_exists else None,
        "training_pending_reason": None
        if model_exists
        else "Historical labeled complaint CSV not yet trained. Using transparent rule-based baseline until priority_scoring/train.py is executed.",
    }


def get_all_model_statuses() -> Dict[str, Any]:
    return {
        "classification": get_classification_status(),
        "duplicate_detection": {
            "objective": "Objective 2: Multimodal Duplicate Complaint Detection",
            "lifecycle_state": "deployed_active",
            "components": ["Haversine GPS filter", "OpenCLIP image embeddings", "SentenceTransformer text embeddings"],
            "default_radius_meters": CONFIG.default_duplicate_radius_meters,
            "auto_group_policy_enabled": CONFIG.auto_group_policy_enabled,
        },
        "priority_scoring": get_priority_status(),
        "resolution_verification": {
            "objective": "Objective 4: AI-Assisted Resolution Verification",
            "lifecycle_state": "deployed_active",
            "components": ["CLAHE + ORB/SSIM comparison", "CLIP visual embedding delta", "Haversine GPS distance validation"],
            "gps_suspicious_distance_meters": CONFIG.gps_suspicious_distance_meters,
        },
    }


def get_all_evaluations() -> Dict[str, Any]:
    cls_eval = _read_json_if_exists(CONFIG.classification_eval_path)
    pri_eval = _read_json_if_exists(CONFIG.priority_eval_path)
    return {
        "classification": cls_eval
        or {
            "lifecycle_state": "implemented_not_trained",
            "metrics": None,
            "confusion_matrix": None,
            "message": "Training and evaluation pending supplied labelled dataset.",
        },
        "priority_scoring": pri_eval
        or {
            "lifecycle_state": "implemented_not_trained",
            "metrics": None,
            "feature_importance": None,
            "confusion_matrix": None,
            "message": "Historical labelled priority training pending supplied CSV dataset.",
        },
    }
