"""Multimodal duplicate complaint scoring engine combining GPS, CLIP, and SentenceTransformers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Optional

from duplicate_detection.geographic_matching import filter_nearby_complaints
from duplicate_detection.image_embeddings import (
    LocalVectorIndex,
    compare_complaint_images,
    compute_image_embedding,
)
from duplicate_detection.text_embeddings import compose_complaint_text, compute_text_similarity
from shared.configuration import CONFIG


def _parse_iso_hours_diff(ts_a: Optional[str], ts_b: Optional[str]) -> float:
    if not ts_a or not ts_b:
        return 0.0
    try:
        dt_a = datetime.fromisoformat(ts_a.replace("Z", "+00:00"))
        dt_b = datetime.fromisoformat(ts_b.replace("Z", "+00:00"))
        return abs((dt_a - dt_b).total_seconds()) / 3600.0
    except ValueError:
        return 24.0


def detect_duplicate_candidates(
    new_complaint: Dict[str, object],
    existing_complaints: List[Dict[str, object]],
    radius_meters: Optional[float] = None,
    auto_group_policy_enabled: Optional[bool] = None,
) -> Dict[str, object]:
    radius = radius_meters if radius_meters is not None else CONFIG.default_duplicate_radius_meters
    auto_group = (
        auto_group_policy_enabled
        if auto_group_policy_enabled is not None
        else CONFIG.auto_group_policy_enabled
    )

    nearby = filter_nearby_complaints(
        target_lat=float(new_complaint["latitude"]),
        target_lon=float(new_complaint["longitude"]),
        candidates=existing_complaints,
        radius_meters=radius,
    )

    vector_index = LocalVectorIndex()
    new_id = str(new_complaint.get("id", "NEW_COMPLAINT"))
    new_img = new_complaint.get("photo_base64")
    if isinstance(new_img, str) and new_img:
        try:
            vec = compute_image_embedding(new_img)
            vector_index.upsert(new_id, vec)
        except Exception:
            pass

    new_text = compose_complaint_text(
        title=str(new_complaint["title"]),
        description=str(new_complaint["description"]),
        category=str(new_complaint["category"]),
        locality=str(new_complaint["locality"]),
    )

    matches: List[Dict[str, object]] = []
    for cand in nearby:
        cand_id = str(cand["id"])
        dist = float(cand["distance_meters"])
        gps_score = max(0.0, 1.0 - (dist / max(1.0, radius)))

        cand_img = cand.get("photo_base64")
        img_sim, has_img = compare_complaint_images(
            new_image_b64=new_img if isinstance(new_img, str) else None,
            candidate_id=cand_id,
            candidate_image_b64=cand_img if isinstance(cand_img, str) else None,
            index=vector_index,
        )

        cand_text = compose_complaint_text(
            title=str(cand["title"]),
            description=str(cand["description"]),
            category=str(cand["category"]),
            locality=str(cand["locality"]),
        )
        text_sim = compute_text_similarity(new_text, cand_text)

        cat_match = str(cand["category"]).lower() == str(new_complaint["category"]).lower()
        hours_diff = _parse_iso_hours_diff(
            str(new_complaint.get("created_at") or datetime.now(timezone.utc).isoformat()),
            str(cand.get("created_at") or ""),
        )
        recency_score = max(0.0, 1.0 - min(hours_diff, 168.0) / 168.0)

        if has_img:
            confidence = (
                0.30 * gps_score
                + 0.30 * img_sim
                + 0.25 * text_sim
                + 0.10 * (1.0 if cat_match else 0.0)
                + 0.05 * recency_score
            )
        else:
            confidence = (
                0.38 * gps_score
                + 0.42 * text_sim
                + 0.12 * (1.0 if cat_match else 0.0)
                + 0.08 * recency_score
            )

        confidence = round(max(0.0, min(1.0, confidence)), 4)

        if confidence >= CONFIG.auto_group_confidence_threshold and auto_group:
            action = "Auto-Group Eligible (Policy Enabled)"
        elif confidence >= 0.55:
            action = "Admin Review & Merge Confirmation Required"
        else:
            action = "Low Match — Keep Separate"

        if confidence >= 0.45:
            matches.append(
                {
                    "original_complaint_id": cand_id,
                    "potential_duplicate_id": new_id,
                    "distance_meters": dist,
                    "image_similarity": img_sim,
                    "text_similarity": text_sim,
                    "category_match": cat_match,
                    "time_diff_hours": round(hours_diff, 2),
                    "duplicate_confidence": confidence,
                    "recommended_action": action,
                    "factor_breakdown": {
                        "gps_proximity_score": round(gps_score, 4),
                        "image_embedding_used": has_img,
                        "recency_score": round(recency_score, 4),
                    },
                }
            )

    matches.sort(key=lambda m: float(m["duplicate_confidence"]), reverse=True)
    return {
        "radius_meters": radius,
        "nearby_checked_count": len(nearby),
        "auto_group_policy_enabled": auto_group,
        "candidates": matches,
    }
