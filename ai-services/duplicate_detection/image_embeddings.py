"""CLIP / OpenCLIP image embedding generator, vector store, and cosine similarity."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np
import torch

from shared.configuration import CONFIG
from shared.preprocessing import decode_base64_image

_CLIP_CACHE: Dict[str, object] = {}


def _load_clip_encoder():
    if "model" in _CLIP_CACHE:
        return _CLIP_CACHE["model"], _CLIP_CACHE["preprocess"], _CLIP_CACHE["device"]

    import open_clip

    device = "cuda" if torch.cuda.is_available() else "cpu"
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="laion2b_s34b_b79k"
    )
    model = model.to(device).eval()
    _CLIP_CACHE["model"] = model
    _CLIP_CACHE["preprocess"] = preprocess
    _CLIP_CACHE["device"] = device
    return model, preprocess, device


def compute_image_embedding(image_b64: str) -> np.ndarray:
    """Compute L2-normalized 512-d OpenCLIP image embedding."""
    pil_img = decode_base64_image(image_b64)
    model, preprocess, device = _load_clip_encoder()
    tensor = preprocess(pil_img).unsqueeze(0).to(device)
    with torch.no_grad():
        feats = model.encode_image(tensor)
        feats = feats / feats.norm(dim=-1, keepdim=True)
    return feats.squeeze(0).cpu().numpy().astype(np.float32)


def cosine_similarity(vec_a: np.ndarray, vec_b: np.ndarray) -> float:
    denom = float(np.linalg.norm(vec_a) * np.linalg.norm(vec_b))
    if denom == 0.0:
        return 0.0
    sim = float(np.dot(vec_a, vec_b) / denom)
    return max(0.0, min(1.0, (sim + 1.0) / 2.0 if sim < 0 else sim))


class LocalVectorIndex:
    """Lightweight persisted vector store for complaint CLIP image embeddings."""

    def __init__(self, index_dir: Optional[Path] = None) -> None:
        self.index_dir = index_dir or CONFIG.vector_index_dir
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.meta_path = self.index_dir / "image_vectors.json"

    def upsert(self, complaint_id: str, embedding: np.ndarray) -> None:
        vec_path = self.index_dir / f"{complaint_id}.npy"
        np.save(vec_path, embedding)
        meta = self._load_meta()
        meta[complaint_id] = str(vec_path)
        self.meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")

    def get(self, complaint_id: str) -> Optional[np.ndarray]:
        meta = self._load_meta()
        path_str = meta.get(complaint_id)
        if not path_str:
            return None
        path = Path(path_str)
        if not path.exists():
            return None
        return np.load(path)

    def _load_meta(self) -> Dict[str, str]:
        if not self.meta_path.exists():
            return {}
        try:
            return json.loads(self.meta_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}


def compare_complaint_images(
    new_image_b64: Optional[str],
    candidate_id: str,
    candidate_image_b64: Optional[str],
    index: Optional[LocalVectorIndex] = None,
) -> Tuple[float, bool]:
    """Return (cosine_similarity, used_clip_embeddings)."""
    if not new_image_b64:
        return 0.0, False

    store = index or LocalVectorIndex()
    new_vec = compute_image_embedding(new_image_b64)
    cand_vec = store.get(candidate_id)
    if cand_vec is None and candidate_image_b64:
        cand_vec = compute_image_embedding(candidate_image_b64)
        store.upsert(candidate_id, cand_vec)

    if cand_vec is None:
        return 0.0, False

    return round(cosine_similarity(new_vec, cand_vec), 4), True
