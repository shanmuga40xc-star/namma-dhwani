"""Model evaluation script generating metrics, confusion matrix, and training curves."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List

import matplotlib.pyplot as plt
import numpy as np
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    precision_recall_fscore_support,
)
import torch
from torch.utils.data import DataLoader

from classification.dataset import NagrikCivicDataset, build_transforms, prepare_splits
from classification.train import DualHeadCivicClassifier
from shared.configuration import CONFIG, NAGRIK_CATEGORIES


def evaluate_model(data_dir: Path) -> Dict[str, object]:
    if not CONFIG.classification_checkpoint_path.exists():
        raise FileNotFoundError(
            f"Checkpoint not found at {CONFIG.classification_checkpoint_path}. Run classification/train.py first."
        )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    ckpt = torch.load(CONFIG.classification_checkpoint_path, map_location=device)
    backbone = ckpt.get("backbone", "mobilenet_v3_large")

    model = DualHeadCivicClassifier(backbone=backbone, pretrained=False).to(device)
    model.load_state_dict(ckpt["state_dict"])
    model.eval()

    manifest = prepare_splits(data_dir)
    _, eval_tf = build_transforms(image_size=224)
    test_ds = NagrikCivicDataset(manifest["test"], transform=eval_tf)
    test_loader = DataLoader(test_ds, batch_size=16, shuffle=False)

    y_true: List[int] = []
    y_pred: List[int] = []

    with torch.no_grad():
        for images, cat_targets, _ in test_loader:
            images = images.to(device)
            cat_logits, _ = model(images)
            preds = cat_logits.argmax(dim=1).cpu().tolist()
            y_pred.extend(preds)
            y_true.extend(cat_targets.tolist())

    acc = float(accuracy_score(y_true, y_pred))
    precision, recall, f1, _ = precision_recall_fscore_support(
        y_true, y_pred, average="weighted", zero_division=0
    )
    cm = confusion_matrix(y_true, y_pred, labels=list(range(len(NAGRIK_CATEGORIES))))
    per_class = classification_report(
        y_true,
        y_pred,
        target_names=NAGRIK_CATEGORIES,
        output_dict=True,
        zero_division=0,
    )

    out_dir = CONFIG.classification_eval_path.parent
    out_dir.mkdir(parents=True, exist_ok=True)

    # Save Confusion Matrix PNG
    cm_fig, ax = plt.subplots(figsize=(6, 5))
    ax.imshow(cm, cmap="Blues")
    ax.set_xticks(np.arange(len(NAGRIK_CATEGORIES)))
    ax.set_yticks(np.arange(len(NAGRIK_CATEGORIES)))
    ax.set_xticklabels(NAGRIK_CATEGORIES, rotation=25, ha="right")
    ax.set_yticklabels(NAGRIK_CATEGORIES)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("NAGRIK Objective 1 Confusion Matrix")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center", color="black")
    cm_fig.tight_layout()
    cm_path = out_dir / "confusion_matrix.png"
    cm_fig.savefig(cm_path, dpi=150)
    plt.close(cm_fig)

    # Save Loss & Accuracy Curve PNG if training metadata exists
    curves_path = out_dir / "training_curves.png"
    if CONFIG.classification_metadata_path.exists():
        meta = json.loads(CONFIG.classification_metadata_path.read_text(encoding="utf-8"))
        hist = meta.get("history", {})
        if hist.get("train_loss"):
            fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4))
            epochs_x = list(range(1, len(hist["train_loss"]) + 1))
            ax1.plot(epochs_x, hist["train_loss"], label="Train Loss")
            ax1.plot(epochs_x, hist["val_loss"], label="Val Loss")
            ax1.set_title("Loss Curve")
            ax1.legend()
            ax2.plot(epochs_x, hist["train_acc"], label="Train Acc")
            ax2.plot(epochs_x, hist["val_acc"], label="Val Acc")
            ax2.set_title("Accuracy Curve")
            ax2.legend()
            fig.tight_layout()
            fig.savefig(curves_path, dpi=150)
            plt.close(fig)

    report = {
        "lifecycle_state": "trained_evaluated",
        "model_version": ckpt.get("model_version", "unknown"),
        "backbone": backbone,
        "test_samples": len(y_true),
        "metrics": {
            "accuracy": round(acc, 4),
            "weighted_precision": round(float(precision), 4),
            "weighted_recall": round(float(recall), 4),
            "weighted_f1": round(float(f1), 4),
        },
        "class_wise_performance": per_class,
        "confusion_matrix": cm.tolist(),
        "categories": NAGRIK_CATEGORIES,
        "artifacts": {
            "confusion_matrix_png": str(cm_path),
            "training_curves_png": str(curves_path),
        },
    }
    CONFIG.classification_eval_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate NAGRIK Objective 1 classifier.")
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    report = evaluate_model(args.data_dir)
    print(json.dumps(report["metrics"], indent=2))


if __name__ == "__main__":
    main()
