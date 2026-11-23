"""Computer-vision comparison of before and after civic issue photographs."""

from __future__ import annotations

from typing import Dict

import cv2
import numpy as np
from skimage.metrics import structural_similarity as ssim

from duplicate_detection.image_embeddings import compute_image_embedding, cosine_similarity
from shared.preprocessing import (
    decode_base64_image,
    normalize_illumination_bgr,
    pil_to_cv2_bgr,
)


def _orb_feature_match_ratio(gray_before: np.ndarray, gray_after: np.ndarray) -> float:
    orb = cv2.ORB_create(nfeatures=500)
    kp1, des1 = orb.detectAndCompute(gray_before, None)
    kp2, des2 = orb.detectAndCompute(gray_after, None)
    if des1 is None or des2 is None or len(kp1) == 0 or len(kp2) == 0:
        return 0.0
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    matches = bf.match(des1, des2)
    good = [m for m in matches if m.distance < 55]
    return round(min(1.0, len(good) / max(1, min(len(kp1), len(kp2)))), 4)


def compare_before_after_images(
    before_image_b64: str,
    after_image_b64: str,
) -> Dict[str, object]:
    """Compare before/after photos accounting for lighting, camera angle, and scene changes."""
    before_pil = decode_base64_image(before_image_b64)
    after_pil = decode_base64_image(after_image_b64)

    before_norm = normalize_illumination_bgr(pil_to_cv2_bgr(before_pil), target_size=(384, 384))
    after_norm = normalize_illumination_bgr(pil_to_cv2_bgr(after_pil), target_size=(384, 384))

    gray_before = cv2.cvtColor(before_norm, cv2.COLOR_BGR2GRAY)
    gray_after = cv2.cvtColor(after_norm, cv2.COLOR_BGR2GRAY)

    ssim_score = float(ssim(gray_before, gray_after))
    orb_ratio = _orb_feature_match_ratio(gray_before, gray_after)

    # Color-histogram Bhattacharyya similarity across central ROI
    hist_b = cv2.calcHist([before_norm], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    hist_a = cv2.calcHist([after_norm], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(hist_b, hist_b)
    cv2.normalize(hist_a, hist_a)
    hist_dist = float(cv2.compareHist(hist_b, hist_a, cv2.HISTCMP_BHATTACHARYYA))
    color_sim = max(0.0, min(1.0, 1.0 - hist_dist))

    clip_used = False
    clip_similarity = round((color_sim + max(0.0, ssim_score)) / 2.0, 4)
    try:
        vec_before = compute_image_embedding(before_image_b64)
        vec_after = compute_image_embedding(after_image_b64)
        clip_similarity = round(cosine_similarity(vec_before, vec_after), 4)
        clip_used = True
    except Exception:
        pass

    return {
        "image_similarity": clip_similarity,
        "ssim_score": round(ssim_score, 4),
        "orb_scene_alignment": orb_ratio,
        "illumination_normalized": True,
        "clip_embedding_used": clip_used,
    }
