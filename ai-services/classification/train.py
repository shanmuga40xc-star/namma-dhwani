"""Transfer learning training script for NAGRIK Objective 1 (Category + Severity)."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from typing import Dict, List, Literal, Tuple

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import models

from classification.dataset import NagrikCivicDataset, build_transforms, prepare_splits
from shared.configuration import CONFIG, NAGRIK_CATEGORIES, SEVERITY_LEVELS

BackboneName = Literal["mobilenet_v3_large", "efficientnet_b0"]


class DualHeadCivicClassifier(nn.Module):
    """Transfer-learning CNN with shared backbone and separate Category + Severity heads."""

    def __init__(
        self,
        backbone: BackboneName = "mobilenet_v3_large",
        num_categories: int = len(NAGRIK_CATEGORIES),
        num_severities: int = len(SEVERITY_LEVELS),
        pretrained: bool = True,
    ) -> None:
        super().__init__()
        self.backbone_name = backbone

        if backbone == "efficientnet_b0":
            weights = models.EfficientNet_B0_Weights.DEFAULT if pretrained else None
            net = models.efficientnet_b0(weights=weights)
            in_features = net.classifier[1].in_features
            net.classifier = nn.Identity()
            self.encoder = net
        else:
            weights = models.MobileNet_V3_Large_Weights.DEFAULT if pretrained else None
            net = models.mobilenet_v3_large(weights=weights)
            in_features = net.classifier[0].in_features
            net.classifier = nn.Identity()
            self.encoder = net

        self.shared_proj = nn.Sequential(
            nn.Dropout(p=0.25),
            nn.Linear(in_features, 256),
            nn.Hardswish(),
            nn.Dropout(p=0.2),
        )
        self.category_head = nn.Linear(256, num_categories)
        self.severity_head = nn.Linear(256, num_severities)

    def forward(self, x: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        feats = self.encoder(x)
        projected = self.shared_proj(feats)
        return self.category_head(projected), self.severity_head(projected)


def train_model(
    data_dir: Path,
    backbone: BackboneName = "mobilenet_v3_large",
    epochs: int = 12,
    batch_size: int = 16,
    lr: float = 3e-4,
    model_version: str = "v1.0.0",
) -> Dict[str, object]:
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    manifest = prepare_splits(data_dir)
    train_tf, eval_tf = build_transforms(image_size=224)

    train_ds = NagrikCivicDataset(manifest["train"], transform=train_tf)
    val_ds = NagrikCivicDataset(manifest["val"], transform=eval_tf)
    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True, num_workers=2)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False, num_workers=2)

    model = DualHeadCivicClassifier(backbone=backbone, pretrained=True).to(device)

    # Freeze early feature layers for initial warm-up epochs
    for param in model.encoder.parameters():
        param.requires_grad = False

    cat_criterion = nn.CrossEntropyLoss()
    sev_criterion = nn.CrossEntropyLoss(ignore_index=-1)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=max(1, epochs))

    history: Dict[str, List[float]] = {
        "train_loss": [],
        "val_loss": [],
        "train_acc": [],
        "val_acc": [],
    }
    best_val_loss = float("inf")
    CONFIG.classification_checkpoint_path.parent.mkdir(parents=True, exist_ok=True)

    for epoch in range(epochs):
        if epoch == max(1, epochs // 3):
            for param in model.encoder.parameters():
                param.requires_grad = True

        model.train()
        running_loss = 0.0
        correct = 0
        total = 0

        for images, cat_targets, sev_targets in train_loader:
            images = images.to(device)
            cat_targets = cat_targets.to(device)
            sev_targets = sev_targets.to(device)

            optimizer.zero_grad()
            cat_logits, sev_logits = model(images)
            loss = cat_criterion(cat_logits, cat_targets)
            if (sev_targets >= 0).any():
                loss = loss + 0.5 * sev_criterion(sev_logits, sev_targets)
            loss.backward()
            optimizer.step()

            running_loss += float(loss.item()) * images.size(0)
            preds = cat_logits.argmax(dim=1)
            correct += int((preds == cat_targets).sum().item())
            total += images.size(0)

        scheduler.step()
        train_loss = running_loss / max(1, total)
        train_acc = correct / max(1, total)

        model.eval()
        val_loss_sum = 0.0
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for images, cat_targets, sev_targets in val_loader:
                images = images.to(device)
                cat_targets = cat_targets.to(device)
                sev_targets = sev_targets.to(device)
                cat_logits, sev_logits = model(images)
                v_loss = cat_criterion(cat_logits, cat_targets)
                if (sev_targets >= 0).any():
                    v_loss = v_loss + 0.5 * sev_criterion(sev_logits, sev_targets)
                val_loss_sum += float(v_loss.item()) * images.size(0)
                val_correct += int((cat_logits.argmax(dim=1) == cat_targets).sum().item())
                val_total += images.size(0)

        val_loss = val_loss_sum / max(1, val_total)
        val_acc = val_correct / max(1, val_total)

        history["train_loss"].append(round(train_loss, 4))
        history["val_loss"].append(round(val_loss, 4))
        history["train_acc"].append(round(train_acc, 4))
        history["val_acc"].append(round(val_acc, 4))

        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(
                {
                    "backbone": backbone,
                    "model_version": model_version,
                    "categories": NAGRIK_CATEGORIES,
                    "severities": SEVERITY_LEVELS,
                    "state_dict": model.state_dict(),
                },
                CONFIG.classification_checkpoint_path,
            )

    metadata = {
        "model_version": model_version,
        "backbone": backbone,
        "categories": NAGRIK_CATEGORIES,
        "severities": SEVERITY_LEVELS,
        "training_date": datetime.now(timezone.utc).isoformat(),
        "dataset_dir": str(data_dir),
        "total_images": manifest["total_images"],
        "counts_per_category": manifest["counts_per_category"],
        "hyperparameters": {
            "epochs": epochs,
            "batch_size": batch_size,
            "learning_rate": lr,
            "optimizer": "AdamW",
            "scheduler": "CosineAnnealingLR",
        },
        "history": history,
        "best_val_loss": round(best_val_loss, 4),
    }
    CONFIG.classification_metadata_path.write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NAGRIK Objective 1 dual-head classifier.")
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument(
        "--backbone",
        choices=["mobilenet_v3_large", "efficientnet_b0"],
        default="mobilenet_v3_large",
    )
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--version", type=str, default="v1.0.0")
    args = parser.parse_args()

    meta = train_model(
        data_dir=args.data_dir,
        backbone=args.backbone,
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        model_version=args.version,
    )
    print(f"Training completed. Checkpoint saved to {CONFIG.classification_checkpoint_path}")
    print(json.dumps(meta["history"], indent=2))


if __name__ == "__main__":
    main()
