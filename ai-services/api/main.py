"""FastAPI entrypoint for NAGRIK Python AI/ML microservices."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import router as ai_router

app = FastAPI(
    title="NAGRIK AI/ML Research Microservice",
    description=(
        "FastAPI service powering NAGRIK Objectives 1–4: "
        "Transfer-learning Civic Image Classification, Multimodal Duplicate Detection, "
        "ML Priority Scoring, and Computer-Vision Resolution Verification."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai_router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "nagrik-ai-services"}
