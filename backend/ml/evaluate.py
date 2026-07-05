"""Quantitative evaluation of a roof-segmentation checkpoint (box + mask mAP).

Runs Ultralytics validation against labeled ground truth and prints the metrics
that gate promotion (mask mAP50), plus vectorizer complexity stats so outline
quality regressions are visible next to accuracy numbers.

Usage:
    python -m ml.evaluate --data ml/data/roof_merged/data.yaml
    python -m ml.evaluate --data ml/data/roof_merged/data.yaml --split test \
        --weights ml/weights/archive/roof_seg_v1_20260101-000000.pt
"""

from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

from ml import config


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate roof segmentation model")
    parser.add_argument("--data", required=True, help="Path to Ultralytics data.yaml")
    parser.add_argument("--weights", default=str(config.MODEL_PATH), help="Checkpoint to evaluate")
    parser.add_argument("--split", default="val", choices=("val", "test"), help="Dataset split")
    parser.add_argument("--imgsz", type=int, default=None, help="Default: imgsz from the model's training metadata")
    parser.add_argument("--conf", type=float, default=0.001, help="Val confidence floor (mAP convention)")
    parser.add_argument("--device", default=None, help="cuda index or 'cpu'")
    parser.add_argument(
        "--vectorize-samples",
        type=int,
        default=0,
        help="Also vectorize predictions on N split images and report avg vertices/roof (0 = skip)",
    )
    return parser.parse_args()


def resolve_imgsz(args: argparse.Namespace) -> int:
    if args.imgsz:
        return args.imgsz

    meta_path = Path(args.weights).with_suffix(".json")
    try:
        meta = json.loads(meta_path.read_text())
        return int(meta["imgsz"])
    except Exception:
        return config.DEFAULT_IMGSZ


def vectorizer_stats(model, data_yaml: str, split: str, imgsz: int, samples: int, device) -> None:
    """Average vertex count of straightened roof outlines on real predictions."""

    import yaml

    from ml.vectorize import mask_to_polygon

    data = yaml.safe_load(Path(data_yaml).read_text())
    split_entry = data.get(split) or data.get("val")
    if not split_entry:
        print(f"[eval] no '{split}' split in {data_yaml}; skipping vectorizer stats")
        return

    base = Path(data_yaml).parent
    image_dir = (base / split_entry).resolve() if not Path(split_entry).is_absolute() else Path(split_entry)
    images = sorted(glob.glob(str(image_dir / "*.*")))[:samples]
    if not images:
        print(f"[eval] no images found under {image_dir}; skipping vectorizer stats")
        return

    vertex_counts: list[int] = []
    for image_path in images:
        results = model.predict(source=image_path, imgsz=imgsz, conf=0.25, device=device,
                                retina_masks=True, verbose=False)
        for result in results:
            if result.masks is None:
                continue
            for mask in result.masks.data.cpu().numpy():
                ring = mask_to_polygon((mask > 0.5).astype("uint8") * 255)
                if ring:
                    vertex_counts.append(len(ring))

    if vertex_counts:
        avg = sum(vertex_counts) / len(vertex_counts)
        print(f"[eval] vectorizer: {len(vertex_counts)} outlines over {len(images)} images, "
              f"avg {avg:.1f} vertices/roof (lower = straighter)")
    else:
        print(f"[eval] vectorizer: no outlines produced over {len(images)} images")


def main() -> None:
    args = parse_args()
    weights = Path(args.weights)
    if not weights.exists():
        raise SystemExit(f"[eval] checkpoint not found: {weights}")

    from ultralytics import YOLO

    imgsz = resolve_imgsz(args)
    model = YOLO(str(weights))

    metrics = model.val(
        data=args.data,
        split=args.split,
        imgsz=imgsz,
        conf=args.conf,
        device=args.device,
        plots=True,
        verbose=False,
    )

    results = {k: round(float(v), 5) for k, v in metrics.results_dict.items()}
    print(f"[eval] weights={weights} split={args.split} imgsz={imgsz}")
    for key in sorted(results):
        print(f"[eval]   {key} = {results[key]}")

    mask_map = results.get("metrics/mAP50(M)")
    if mask_map is not None:
        print(f"[eval] mask mAP50 = {mask_map}  (promotion gate metric for ml.train --min-map)")

    if args.vectorize_samples > 0:
        vectorizer_stats(model, args.data, args.split, imgsz, args.vectorize_samples, args.device)


if __name__ == "__main__":
    main()
