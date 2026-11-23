"""SentenceTransformer text embedding similarity for complaint metadata."""

from __future__ import annotations

from typing import Dict

import numpy as np

_TEXT_ENCODER_CACHE: Dict[str, object] = {}


def _load_sentence_transformer():
    if "model" not in _TEXT_ENCODER_CACHE:
        from sentence_transformers import SentenceTransformer

        _TEXT_ENCODER_CACHE["model"] = SentenceTransformer("all-MiniLM-L6-v2")
    return _TEXT_ENCODER_CACHE["model"]


def compose_complaint_text(
    title: str,
    description: str,
    category: str,
    locality: str,
) -> str:
    return f"Category: {category}. Locality: {locality}. Title: {title}. Details: {description}"


def compute_text_similarity(
    text_a: str,
    text_b: str,
) -> float:
    """Compute cosine similarity using SentenceTransformer all-MiniLM-L6-v2 embeddings."""
    model = _load_sentence_transformer()
    embeddings = model.encode([text_a, text_b], normalize_embeddings=True)
    vec_a, vec_b = embeddings[0], embeddings[1]
    score = float(np.dot(vec_a, vec_b))
    return round(max(0.0, min(1.0, score)), 4)
