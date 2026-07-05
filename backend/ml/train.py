"""Train the roof-plane / obstacle instance-segmentation model (YOLO11-seg).

Usage:
    python -m ml.train --data ml/data/roof_merged/data.yaml --model yolo11s-seg.pt \
        --epochs 120 --imgsz 896 --batch -1

Aerial/nadir imagery has no canonical "up", so we lean on full rotation and
dual-axis flips.

Promotion: after training, the best checkpoint is promoted to
``ml/weights/roof_seg.pt`` (where the inference layer looks for it) only when
its mask mAP50 clears ``--min-map`` (default 0, i.e. always promote). Every
best checkpoint — promoted or not — is archived under ``ml/weights/archive/``
with a metadata JSON so a bad model can be rolled back by copying an archived
pair over ``roof_seg.pt`` / ``roof_seg.json``.
"""

from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone
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
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument(
        "--deterministic",
        action="store_true",
        help="Bit-exact reproducibility (slower); off by default for speed",
    )
    parser.add_argument(
        "--min-map",
        type=float,
        default=0.0,
        help="Minimum mask mAP50 required to promote best.pt to the serving path",
    )
    return parser.parse_args()


def extract_metrics(results) -> dict:
    """Pull the final validation metrics out of an Ultralytics train result."""

    metrics: dict = {}
    results_dict = getattr(results, "results_dict", None)
    if isinstance(results_dict, dict):
        for key, value in results_dict.items():
            try:
                metrics[str(key)] = round(float(value), 5)
            except (TypeError, ValueError):
                continue
    return metrics


def mask_map50(metrics: dict) -> float | None:
    for key in ("metrics/mAP50(M)", "metrics/mAP50(B)"):
        if key in metrics:
            return metrics[key]
    return None


def promote(best: Path, args: argparse.Namespace, metrics: dict) -> None:
    """Archive the checkpoint, then (metrics permitting) promote it to serving."""

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    meta = {
        "run_name": args.name,
        "trained_at_utc": stamp,
        "base_model": args.model,
        "data": str(args.data),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "seed": args.seed,
        "deterministic": args.deterministic,
        "metrics": metrics,
    }

    config.ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    archive_pt = config.ARCHIVE_DIR / f"{args.name}_{stamp}.pt"
    shutil.copy2(best, archive_pt)
    archive_pt.with_suffix(".json").write_text(json.dumps(meta, indent=2))
    print(f"[train] checkpoint archived -> {archive_pt}")

    score = mask_map50(metrics)
    if args.min_map > 0 and (score is None or score < args.min_map):
        print(
            f"[train] NOT promoted: mask mAP50 {score} below --min-map {args.min_map}. "
            f"Serving checkpoint left untouched; archived copy kept for inspection."
        )
        return

    shutil.copy2(best, config.MODEL_PATH)
    config.MODEL_META_PATH.write_text(json.dumps(meta, indent=2))
    print(f"[train] best checkpoint promoted -> {config.MODEL_PATH} (mask mAP50={score})")


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
        seed=args.seed,
        deterministic=args.deterministic,
        plots=True,
    )

    best = Path(results.save_dir) / "weights" / "best.pt"
    if not best.exists():
        print(f"[train] WARNING: best.pt not found at {best}; nothing promoted")
        return

    metrics = extract_metrics(results)
    promote(best, args, metrics)


if __name__ == "__main__":
    main()
