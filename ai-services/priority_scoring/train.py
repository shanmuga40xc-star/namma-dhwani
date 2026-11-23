"""Scikit-learn RandomForest / GradientBoosting training pipeline for Objective 3."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, Literal

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.model_selection import StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from priority_scoring.feature_engineering import build_feature_frame
from shared.configuration import CONFIG, SEVERITY_LEVELS

AlgorithmName = Literal["random_forest", "gradient_boosting"]


def train_priority_model(
    csv_path: Path,
    algorithm: AlgorithmName = "gradient_boosting",
    model_version: str = "v1.0.0",
) -> Dict[str, object]:
    if not csv_path.exists():
        raise FileNotFoundError(f"Historical labelled priority CSV not found: {csv_path}")

    df = pd.read_csv(csv_path)
    if "target_priority" not in df.columns:
        raise ValueError("Dataset must contain 'target_priority' column with values Low/Medium/High/Critical.")

    df = df[df["target_priority"].isin(SEVERITY_LEVELS)].copy()
    if len(df) < 30:
        raise ValueError("Supply at least 30 labelled historical rows for cross-validated training.")

    X = build_feature_frame(df.to_dict(orient="records"))
    y = df["target_priority"].astype(str)

    numeric_features = [
        "severity_ord",
        "unique_supports",
        "age_hours",
        "duplicate_count",
        "ward_avg_res_hours",
    ]
    categorical_features = ["category", "locality"]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ]
    )

    if algorithm == "random_forest":
        clf = RandomForestClassifier(
            n_estimators=200,
            max_depth=10,
            class_weight="balanced",
            random_state=42,
        )
    else:
        clf = GradientBoostingClassifier(
            n_estimators=150,
            learning_rate=0.08,
            max_depth=4,
            random_state=42,
        )

    pipeline = Pipeline([("prep", preprocessor), ("clf", clf)])
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1_weighted")

    pipeline.fit(X, y)

    CONFIG.priority_model_path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(pipeline, CONFIG.priority_model_path)

    metadata = {
        "model_version": model_version,
        "algorithm": algorithm,
        "training_date": datetime.now(timezone.utc).isoformat(),
        "dataset_path": str(csv_path),
        "sample_count": int(len(df)),
        "cv_weighted_f1_mean": round(float(cv_scores.mean()), 4),
        "cv_weighted_f1_std": round(float(cv_scores.std()), 4),
        "classes": SEVERITY_LEVELS,
        "label_rubric_note": (
            "target_priority derived from supervisor-audited SLA urgency & safety impact; "
            "unverified citizen votes are excluded from ground-truth labelling."
        ),
    }
    CONFIG.priority_metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NAGRIK Objective 3 priority model.")
    parser.add_argument("--csv", type=Path, required=True)
    parser.add_argument(
        "--algorithm",
        choices=["random_forest", "gradient_boosting"],
        default="gradient_boosting",
    )
    parser.add_argument("--version", type=str, default="v1.0.0")
    args = parser.parse_args()

    meta = train_priority_model(args.csv, algorithm=args.algorithm, model_version=args.version)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main()
