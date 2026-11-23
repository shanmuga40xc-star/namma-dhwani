"""Central configuration for NAGRIK Python AI/ML microservices."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List


BASE_DIR = Path(__file__).resolve().parent.parent
DATASETS_DIR = Path(os.getenv("NAGRIK_DATASETS_DIR", BASE_DIR / "datasets"))
MODELS_DIR = Path(os.getenv("NAGRIK_MODELS_DIR", BASE_DIR / "models"))

NAGRIK_CATEGORIES: List[str] = [
    "Potholes",
    "Garbage accumulation",
    "Water leakage",
    "Broken streetlights",
]

CATEGORY_FOLDER_MAP = {
    "potholes": "Potholes",
    "garbage_accumulation": "Garbage accumulation",
    "water_leakage": "Water leakage",
    "broken_streetlights": "Broken streetlights",
}

SEVERITY_LEVELS: List[str] = ["Low", "Medium", "High", "Critical"]


@dataclass
class ServiceConfig:
    api_key: str = field(default_factory=lambda: os.getenv("AI_SERVICE_API_KEY", ""))
    default_duplicate_radius_meters: float = float(
        os.getenv("DEFAULT_DUPLICATE_RADIUS_METERS", "100.0")
    )
    auto_group_policy_enabled: bool = (
        os.getenv("AUTO_GROUP_DUPLICATES_ENABLED", "false").lower() == "true"
    )
    auto_group_confidence_threshold: float = float(
        os.getenv("AUTO_GROUP_CONFIDENCE_THRESHOLD", "0.85")
    )
    gps_suspicious_distance_meters: float = float(
        os.getenv("GPS_SUSPICIOUS_DISTANCE_METERS", "250.0")
    )
    classification_checkpoint_path: Path = field(
        default_factory=lambda: MODELS_DIR / "classification" / "nagrik_classifier.pt"
    )
    classification_metadata_path: Path = field(
        default_factory=lambda: MODELS_DIR / "classification" / "model_metadata.json"
    )
    classification_eval_path: Path = field(
        default_factory=lambda: MODELS_DIR / "classification" / "evaluation_report.json"
    )
    priority_model_path: Path = field(
        default_factory=lambda: MODELS_DIR / "priority" / "priority_model.joblib"
    )
    priority_metadata_path: Path = field(
        default_factory=lambda: MODELS_DIR / "priority" / "priority_metadata.json"
    )
    priority_eval_path: Path = field(
        default_factory=lambda: MODELS_DIR / "priority" / "priority_evaluation.json"
    )
    vector_index_dir: Path = field(
        default_factory=lambda: MODELS_DIR / "embeddings"
    )


CONFIG = ServiceConfig()
