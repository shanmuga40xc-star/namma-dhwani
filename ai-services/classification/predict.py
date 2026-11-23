"""Inference pipeline for NAGRIK Objective 1 (Category + Severity)."""

from __future__ import annotations

from typing import Dict

import torch
import torch.nn.functional as F

from classification.dataset import build_transforms
from classification.train import DualHeadCivicClassifier
from shared.configuration import CONFIG, NAGRIK_CATEGORIES, SEVERITY_LEVELS
from shared.preprocessing import decode_base64_image


class ModelNotTrainedError(RuntimeError):
    """Raised when classification inference is requested before weights are trained."""


_MODEL_CACHE: Dict[str, object] = {}


def _load_trained_model() -> DualHeadCivicClassifier:
    if not CONFIG.classification_checkpoint_path.exists():
        raise ModelNotTrainedError(
            "Trained Objective 1 weights not found. Supply labelled images and run classification/train.py."
        )
    if "model" not in _MODEL_CACHE:
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        ckpt = torch.load(CONFIG.classification_checkpoint_path, map_location=device)
        model = DualHeadCivicClassifier(
            backbone=ckpt.get("backbone", "mobilenet_v3_large"),
            pretrained=False,
        ).to(device)
        model.load_state_dict(ckpt["state_dict"])
        model.eval()
        _MODEL_CACHE["model"] = model
        _MODEL_CACHE["device"] = device
        _MODEL_CACHE["version"] = ckpt.get("model_version", "unknown")
    return _MODEL_CACHE["model"]  # type: ignore[return-value]


def predict_issue_from_base64(image_b64: str) -> Dict[str, object]:
    model = _load_trained_model()
    device = _MODEL_CACHE["device"]  # type: ignore[assignment]
    _, eval_tf = build_transforms(image_size=224)

    pil_img = decode_base64_image(image_b64)
    tensor = eval_tf(pil_img).unsqueeze(0).to(device)

    with torch.no_grad():
        cat_logits, sev_logits = model(tensor)
        cat_probs = F.softmax(cat_logits, dim=1).squeeze(0).cpu().tolist()
        sev_probs = F.softmax(sev_logits, dim=1).squeeze(0).cpu().tolist()

    cat_idx = int(max(range(len(cat_probs)), key=lambda idx: cat_probs[idx]))
    sev_idx = int(max(range(len(sev_probs)), key=lambda idx: sev_probs[idx]))

    return {
        "predicted_category": NAGRIK_CATEGORIES[cat_idx],
        "confidence": round(float(cat_probs[cat_idx]), 4),
        "class_probabilities": {
            NAGRIK_CATEGORIES[i]: round(float(cat_probs[i]), 4)
            for i in range(len(NAGRIK_CATEGORIES))
        },
        "predicted_severity": SEVERITY_LEVELS[sev_idx],
        "severity_confidence": round(float(sev_probs[sev_idx]), 4),
        "severity_human_review_note": (
            "Visual appearance alone cannot capture every structural or safety hazard; confirm severity manually."
        ),
        "model_version": _MODEL_CACHE.get("version", "unknown"),
        "lifecycle_state": "deployed_active",
    }
