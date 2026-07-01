"""Train the roof-plane / obstacle instance-segmentation model (YOLO11-seg).

Usage:
    python -m ml.train --data ml/data/roof/data.yaml --model yolo11s-seg.pt \
        --epochs 120 --imgsz 896 --batch -1

Aerial/nadir imagery has no canonical "up", so we lean on full rotation and
dual-axis flips. The best checkpoint is copied to ``ml/weights/roof_seg.pt``
where the inference layer looks for it.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from ml import config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train roof segmentation model")
    parser.add_argument("--data", required=True, help="Path to Ultralytics data.yaml")
    parser.add_argument("--model", default="yolo11s-seg.pt", help="Base checkpoint")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--imgsz", type=int, default=896)
    parser.add_argument("--batch", type=float, default=-1, help="-1 = auto (60%% VRAM)")
    parser.add_argument("--patience", type=int, default=30)
    parser.add_argument("--workers", type=int, default=4, help="DataLoader workers (lower = less RAM)")
    parser.add_argument("--device", default=None, help="cuda index or 'cpu'")
    parser.add_argument("--name", default="roof_seg")
    parser.add_argument("--resume", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    from ultralytics import YOLO

    config.WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    config.RUNS_DIR.mkdir(parents=True, exist_ok=True)

    device = args.device
    if device is None:
        try:
            import torch

            device = 0 if torch.cuda.is_available() else "cpu"
        except Exception:
            device = "cpu"

    model = YOLO(args.model)
    results = model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=args.patience,
        device=device,
        workers=args.workers,
        cache=False,        # keep system RAM low on constrained Windows hosts
        project=str(config.RUNS_DIR),
        name=args.name,
        resume=args.resume,
        # --- augmentation tuned for nadir aerial imagery ---
        degrees=180.0,      # roofs have arbitrary orientation
        fliplr=0.5,
        flipud=0.5,
        scale=0.5,
        translate=0.1,
        mosaic=1.0,
        close_mosaic=15,
        hsv_h=0.015,
        hsv_s=0.5,
        hsv_v=0.4,
        perspective=0.0,
        # --- optimisation ---
        optimizer="auto",
        lr0=0.01,
        cos_lr=True,
        overlap_mask=True,
        mask_ratio=4,
        seed=0,
        deterministic=False,
        plots=True,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    if best.exists():
        shutil.copy2(best, config.MODEL_PATH)
        print(f"[train] best checkpoint copied -> {config.MODEL_PATH}")
    else:
        print(f"[train] WARNING: best.pt not found at {best}")


if __name__ == "__main__":
    main()
