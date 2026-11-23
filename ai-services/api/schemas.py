"""Pydantic request/response schemas for NAGRIK FastAPI endpoints."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ClassifyRequest(BaseModel):
    image_base64: str = Field(..., min_length=16, description="Base64 or data URI image payload")


class CandidateComplaintItem(BaseModel):
    id: str
    title: str
    description: str
    category: str
    locality: str
    latitude: float
    longitude: float
    photo_base64: Optional[str] = None
    created_at: Optional[str] = None


class NewComplaintDuplicateInput(BaseModel):
    id: Optional[str] = "NEW_COMPLAINT"
    title: str
    description: str
    category: str
    locality: str
    latitude: float
    longitude: float
    photo_base64: Optional[str] = None
    created_at: Optional[str] = None


class DetectDuplicatesRequest(BaseModel):
    new_complaint: NewComplaintDuplicateInput
    existing_complaints: List[CandidateComplaintItem]
    radius_meters: Optional[float] = Field(default=100.0, ge=10.0, le=5000.0)
    auto_group_policy_enabled: Optional[bool] = False


class PriorityScoreRequest(BaseModel):
    severity: str = "Medium"
    category: str = "Potholes"
    unique_supports: int = Field(default=0, ge=0)
    age_hours: float = Field(default=0.0, ge=0.0)
    locality: str = "General"
    duplicate_count: int = Field(default=0, ge=0)
    ward_avg_res_hours: float = Field(default=24.0, gt=0.0)


class VerifyResolutionRequest(BaseModel):
    before_image_base64: str = Field(..., min_length=16)
    after_image_base64: str = Field(..., min_length=16)
    original_latitude: float = Field(..., ge=-90.0, le=90.0)
    original_longitude: float = Field(..., ge=-180.0, le=180.0)
    resolution_latitude: float = Field(..., ge=-90.0, le=90.0)
    resolution_longitude: float = Field(..., ge=-180.0, le=180.0)
