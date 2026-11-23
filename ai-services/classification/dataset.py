"""Dataset loader, augmentation transforms, and train/val/test preparation for Objective 1."""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from PIL import Image
from sklearn.model_selection import train_test_split
import torch
from torch.utils.data import Dataset
from torchvision import transforms

from shared.configuration import CATEGORY_FOLDER_MAP, NAGRIK_CATEGORIES, SEVERITY_LEVELS

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def build_transforms(image_size: int = 224) -> Tuple[transforms.Compose, transforms.Compose]:
    """Return training (augmented) and evaluation/inference transforms with ImageNet normalization."""
    mean = [0.485, 0.456, 0.406]
    std = [0.229, 0.224, 0.225]

    train_tf = transforms.Compose(
        [
            transforms.RandomResizedCrop(image_size, scale=(0.8, 1.0)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(degrees=12),
            transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.15),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std),
        ]
    )

    eval_tf = transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=mean, std=std),
        ]
    )
    return train_tf, eval_tf


class NagrikCivicDataset(Dataset):
    """PyTorch Dataset returning (image_tensor, category_idx, severity_idx)."""

    def __init__(
        self,
        samples: List[Dict[str, object]],
        transform: Optional[transforms.Compose] = None,
    ) -> None:
        self.samples = samples
        self.transform = transform

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int) -> Tuple[torch.Tensor, int, int]:
        record = self.samples[idx]
        img = Image.open(str(record["path"])).convert("RGB")
        if self.transform is not None:
            tensor = self.transform(img)
        else:
            _, eval_tf = build_transforms()
            tensor = eval_tf(img)
        return tensor, int(record["category_idx"]), int(record["severity_idx"])


def scan_labelled_dataset(data_dir: Path) -> List[Dict[str, object]]:
    """Scan class folders and optional annotations.csv for category + severity labels."""
    if not data_dir.exists():
        raise FileNotFoundError(f"Dataset directory does not exist: {data_dir}")

    severity_lookup: Dict[str, int] = {}
    annotations_csv = data_dir / "annotations.csv"
    if annotations_csv.exists():
        with annotations_csv.open("r", encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            for row in reader:
                fname = (row.get("filename") or "").strip()
                sev = (row.get("severity") or "").strip()
                if fname and sev in SEVERITY_LEVELS:
                    severity_lookup[fname] = SEVERITY_LEVELS.index(sev)

    samples: List[Dict[str, object]] = []
    for folder_name, canonical_category in CATEGORY_FOLDER_MAP.items():
        cat_dir = data_dir / folder_name
        if not cat_dir.exists():
            continue
        cat_idx = NAGRIK_CATEGORIES.index(canonical_category)
        for file_path in sorted(cat_dir.rglob("*")):
            if file_path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            # Default severity index is -1 when unannotated so loss masks unknown severity labels
            sev_idx = severity_lookup.get(file_path.name, -1)
            samples.append(
                {
                    "path": str(file_path.resolve()),
                    "filename": file_path.name,
                    "category": canonical_category,
                    "category_idx": cat_idx,
                    "severity_idx": sev_idx,
                }
            )

    return samples


def prepare_splits(
    data_dir: Path,
    val_size: float = 0.15,
    test_size: float = 0.15,
    seed: int = 42,
) -> Dict[str, object]:
    """Create stratified train/validation/test splits without data leakage."""
    samples = scan_labelled_dataset(data_dir)
    if len(samples) < 20:
        raise ValueError(
            f"Insufficient labelled images ({len(samples)}) in {data_dir}. Supply at least 20 images across classes."
        )

    labels = [int(s["category_idx"]) for s in samples]
    train_samples, temp_samples, _, temp_labels = train_test_split(
        samples,
        labels,
        test_size=(val_size + test_size),
        stratify=labels,
        random_state=seed,
    )
    rel_test = test_size / (val_size + test_size)
    val_samples, test_samples = train_test_split(
        temp_samples,
        test_size=rel_test,
        stratify=temp_labels,
        random_state=seed,
    )

    counts = Counter(str(s["category"]) for s in samples)
    return {
        "total_images": len(samples),
        "counts_per_category": dict(counts),
        "train": train_samples,
        "val": val_samples,
        "test": test_samples,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare NAGRIK Objective 1 dataset splits.")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    parser.add_argument("--val-size", type=float, default=0.15)
    parser.add_argument("--test-size", type=float, default=0.15)
    args = parser.parse_args()

    manifest = prepare_splits(args.data_dir, val_size=args.val_size, test_size=args.test_size)
    args.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output_manifest.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Prepared dataset manifest at {args.output_manifest} ({manifest['total_images']} images)")


if __name__ == "__main__":
    main()
