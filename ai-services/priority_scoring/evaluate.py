"""Evaluation script for Objective 3 priority prediction model."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict

import joblib
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score

from priority_scoring.feature_engineering import build_feature_frame
from shared.configuration import CONFIG, SEVERITY_LEVELS


def evaluate_priority_model(csv_path: Path) -> Dict[str, object]:
    if not CONFIG.priority_model_path.exists():
        raise FileNotFoundError(
            f"Priority model not found at {CONFIG.priority_model_path}. Run priority_scoring/train.py first."
        )
    df = pd.read_csv(csv_path)
    df = df[df["target_priority"].isin(SEVERITY_LEVELS)].copy()

    X = build_feature_frame(df.to_dict(orient="records"))
    y_true = df["target_priority"].astype(str)

    pipeline = joblib.load(CONFIG.priority_model_path)
    y_pred = pipeline.predict(X)

    acc = float(accuracy_score(y_true, y_pred))
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=SEVERITY_LEVELS)

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    cv_scores = cross_val_score(pipeline, X, y_true, cv=cv, scoring="f1_weighted")

    prep = pipeline.named_steps["prep"]
    clf = pipeline.named_steps["clf"]
    feature_names = list(prep.get_feature_names_out())
    importances = getattr(clf, "feature_importances_", [])
    feature_importance = sorted(
        [
            {"feature": name, "importance": round(float(val), 4)}
            for name, val in zip(feature_names, importances)
        ],
        key=lambda item: item["importance"],
        reverse=True,
    )[:12]

    report = {
        "lifecycle_state": "trained_evaluated",
        "sample_count": int(len(df)),
        "metrics": {
            "accuracy": round(acc, 4),
            "weighted_precision": round(float(precision), 4),
            "weighted_recall": round(float(recall), 4),
            "weighted_f1": round(float(f1), 4),
            "cv_weighted_f1_mean": round(float(cv_scores.mean()), 4),
            "cv_weighted_f1_std": round(float(cv_scores.std()), 4),
        },
        "class_report": classification_report(
            y_true, y_pred, labels=SEVERITY_LEVELS, output_dict=True, zero_division=0
        ),
        "confusion_matrix": cm.tolist(),
        "labels": SEVERITY_LEVELS,
        "feature_importance": feature_importance,
    }
    CONFIG.priority_eval_path.parent.mkdir(parents=True, exist_ok=True)
    CONFIG.priority_eval_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate NAGRIK Objective 3 priority model.")
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    report = evaluate_priority_model(args.csv)
    print(json.dumps(report["metrics"], indent=2))


if __name__ == "__main__":
    main()
