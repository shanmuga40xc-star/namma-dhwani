# NAGRIK Datasets Directory

Do **not** commit copyrighted or unverified scraped images into version control. Place developer-supplied labelled datasets in the class-based layout below:

```text
datasets/
  civic_issues/
    potholes/
    garbage_accumulation/
    water_leakage/
    broken_streetlights/
    annotations.csv          # Optional: filename,category,severity
  priority_history/
    complaints_labelled.csv  # Columns: severity,category,unique_supports,age_hours,locality,duplicate_count,ward_avg_res_hours,target_priority
```

Run dataset validation and deterministic train/val/test split preparation:

```bash
python -m classification.dataset --data-dir datasets/civic_issues --output-manifest datasets/civic_issues/splits.json
```
