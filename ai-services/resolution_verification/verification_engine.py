"""Resolution verification engine combining CV image signals and GPS proximity."""

from __future__ import annotations

from typing import Dict

from resolution_verification.gps_validation import validate_resolution_gps
from resolution_verification.image_comparison import compare_before_after_images


def evaluate_resolution_evidence(
    before_image_b64: str,
    after_image_b64: str,
    original_lat: float,
    original_lon: float,
    resolution_lat: float,
    resolution_lon: float,
) -> Dict[str, object]:
    gps_result = validate_resolution_gps(
        original_lat=original_lat,
        original_lon=original_lon,
        resolution_lat=resolution_lat,
        resolution_lon=resolution_lon,
    )
    vision_result = compare_before_after_images(
        before_image_b64=before_image_b64,
        after_image_b64=after_image_b64,
    )

    img_sim = float(vision_result["image_similarity"])
    ssim_val = float(vision_result["ssim_score"])
    gps_suspicious = bool(gps_result["gps_suspicious"])
    orb_align = float(vision_result["orb_scene_alignment"])

    # Note: visual similarity alone never proves successful resolution.
    if gps_suspicious:
        recommendation = "Suspicious Evidence"
        explanation = (
            f"Resolution GPS location is {gps_result['distance_meters']}m away from original complaint coordinates "
            f"(exceeding {gps_result['threshold_meters']}m threshold). Requires mandatory supervisor audit."
        )
    elif ssim_val > 0.96 and img_sim > 0.97:
        recommendation = "Needs Manual Review"
        explanation = (
            "Before and after photographs are nearly identical (SSIM > 0.96); confirm the issue was actually repaired "
            "and not a re-upload of the original photograph."
        )
    elif img_sim < 0.35 and orb_align < 0.05:
        recommendation = "Needs Manual Review"
        explanation = (
            "Low scene correspondence between original and after photographs (possible camera angle/lighting shift or mismatched site). "
            "Human verification required."
        )
    else:
        recommendation = "Likely Resolved"
        explanation = (
            "GPS coordinates verified near complaint origin with plausible structural change in the same scene context. "
            "Visual similarity alone does not prove resolution; citizen confirmation remains enabled."
        )

    return {
        "ai_recommendation": recommendation,
        "explanation": explanation,
        "gps_validation": gps_result,
        "image_comparison": vision_result,
        "human_review_required_note": (
            "Visual similarity alone never constitutes proof of resolution. Citizen confirmation or admin audit is required."
        ),
    }
