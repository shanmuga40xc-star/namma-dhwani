# NAGRIK Model Artifacts Directory

Trained checkpoints, metadata JSONs, evaluation reports, and local embedding indexes are stored here after running training scripts:

- `classification/nagrik_classifier.pt` — PyTorch MobileNetV3 / EfficientNet-B0 dual-head weights (category + severity)
- `classification/model_metadata.json` — Architecture, hyperparameters, dataset counts, training timestamp, and version
- `classification/evaluation_report.json` — Accuracy, precision, recall, F1, confusion matrix, and loss/accuracy curve paths
- `priority/priority_model.joblib` — scikit-learn RandomForest / GradientBoosting pipeline
- `priority/priority_evaluation.json` — Cross-validation scores, confusion matrix, and feature importances
- `embeddings/` — Persisted CLIP image embedding vectors for duplicate search

Until training scripts are executed on real datasets, `GET /ai/model-status` accurately reports `"implemented_not_trained"`.
