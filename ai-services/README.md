# NAGRIK AI/ML Microservice (`ai-services`)

Independent Python FastAPI service implementing all four NAGRIK AI/ML research objectives:

1. **Objective 1 (`classification/`)**: Transfer learning with PyTorch MobileNetV3 / EfficientNet-B0 for 4 civic classes (`Potholes`, `Garbage accumulation`, `Water leakage`, `Broken streetlights`) and 4 severity tiers (`Low`, `Medium`, `High`, `Critical`).
2. **Objective 2 (`duplicate_detection/`)**: Multimodal duplicate engine combining Haversine GPS filtering (default `100m`), OpenCLIP image embeddings, and SentenceTransformer text embeddings.
3. **Objective 3 (`priority_scoring/`)**: scikit-learn RandomForest / GradientBoosting priority classifier (`0–100` score + tier + feature factor explanations), paired with a transparent rule-based baseline prior to historical training.
4. **Objective 4 (`resolution_verification/`)**: OpenCV CLAHE + ORB alignment + SSIM + CLIP visual comparison combined with Haversine GPS distance validation between complaint origin and resolution photo coordinates.

## Local Setup

```bash
cd ai-services
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

## Training & Evaluation Workflows

### Objective 1: Image & Severity Classifier
```bash
python -m classification.dataset --data-dir datasets/civic_issues --output-manifest datasets/civic_issues/splits.json
python -m classification.train --data-dir datasets/civic_issues --backbone mobilenet_v3_large --epochs 15
python -m classification.evaluate --data-dir datasets/civic_issues
```

### Objective 3: Priority Scoring Model
```bash
python -m priority_scoring.train --csv datasets/priority_history/complaints_labelled.csv --algorithm gradient_boosting
python -m priority_scoring.evaluate --csv datasets/priority_history/complaints_labelled.csv
```

## Endpoints
- `POST /ai/classify`
- `POST /ai/detect-duplicates`
- `POST /ai/priority-score`
- `POST /ai/verify-resolution`
- `GET /ai/model-status`
- `GET /ai/evaluation`
