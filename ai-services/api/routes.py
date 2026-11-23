"""FastAPI routes exposing all four NAGRIK AI/ML objectives and evaluation reports."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status

from api.schemas import (
    ClassifyRequest,
    DetectDuplicatesRequest,
    PriorityScoreRequest,
    VerifyResolutionRequest,
)
from classification.predict import ModelNotTrainedError, predict_issue_from_base64
from duplicate_detection.duplicate_engine import detect_duplicate_candidates
from priority_scoring.predict import predict_priority
from resolution_verification.verification_engine import evaluate_resolution_evidence
from shared.configuration import CONFIG
from shared.model_registry import get_all_evaluations, get_all_model_statuses

router = APIRouter(prefix="/ai", tags=["NAGRIK AI/ML"])


def verify_api_key(x_ai_service_key: str | None = Header(default=None)) -> None:
    if CONFIG.api_key and x_ai_service_key != CONFIG.api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-AI-Service-Key header.",
        )


@router.post("/classify", dependencies=[Depends(verify_api_key)])
def classify_issue(payload: ClassifyRequest):
    try:
        return predict_issue_from_base64(payload.image_base64)
    except ModelNotTrainedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "model_not_trained",
                "lifecycle_state": "implemented_not_trained",
                "message": str(exc),
            },
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to classify image payload: {exc}",
        ) from exc


@router.post("/detect-duplicates", dependencies=[Depends(verify_api_key)])
def detect_duplicates(payload: DetectDuplicatesRequest):
    try:
        return detect_duplicate_candidates(
            new_complaint=payload.new_complaint.model_dump(),
            existing_complaints=[c.model_dump() for c in payload.existing_complaints],
            radius_meters=payload.radius_meters,
            auto_group_policy_enabled=payload.auto_group_policy_enabled,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Duplicate detection failure: {exc}",
        ) from exc


@router.post("/priority-score", dependencies=[Depends(verify_api_key)])
def score_priority(payload: PriorityScoreRequest):
    try:
        return predict_priority(payload.model_dump())
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Priority scoring failure: {exc}",
        ) from exc


@router.post("/verify-resolution", dependencies=[Depends(verify_api_key)])
def verify_resolution(payload: VerifyResolutionRequest):
    try:
        return evaluate_resolution_evidence(
            before_image_b64=payload.before_image_base64,
            after_image_b64=payload.after_image_base64,
            original_lat=payload.original_latitude,
            original_lon=payload.original_longitude,
            resolution_lat=payload.resolution_latitude,
            resolution_lon=payload.resolution_longitude,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Resolution verification failure: {exc}",
        ) from exc


@router.get("/model-status", dependencies=[Depends(verify_api_key)])
def model_status():
    return get_all_model_statuses()


@router.get("/evaluation", dependencies=[Depends(verify_api_key)])
def model_evaluation():
    return get_all_evaluations()
