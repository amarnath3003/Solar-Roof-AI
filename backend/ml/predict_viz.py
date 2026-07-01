"""Run the trained model on image(s) and render the vectorized outlines.

This is the eyeball test for "are the outlines clean and straight". For each
image it draws: filled roof planes (translucent), the straightened polygon edge
(bright), vertices (dots), and obstacle centroids (crosses). Also prints vertex
counts so we can confirm the regularizer is producing few, straight edges.

    python -m ml.predict_viz --images ml/eval/*.png --out ml/eval/out
"""

from __future__ import annotations

import argparse
import glob
from pathlib import Path

import cv2
import numpy as np

from ml import config
from ml.inference import RoofSegmenter
from ml.vectorize import mask_to_polygon, polygon_area_px

ROOF_COLOR = (60, 220, 60)
OBSTACLE_COLOR = (60, 120, 255)


def _draw(image: np.ndarray, instances) -> tuple[np.ndarray, int, int]:
    overlay = image.copy()
    out = image.copy()
    roof_n = 0
    obstacle_n = 0
    vertex_total = 0

    for inst in instances:
        if inst.category == "obstacle":
            m = cv2.moments(inst.mask, binaryImage=True)
            if m["m00"] == 0:
                continue
            cx, cy = int(m["m10"] / m["m00"]), int(m["m01"] / m["m00"])
            cv2.drawMarker(out, (cx, cy), OBSTACLE_COLOR, cv2.MARKER_TILTED_CROSS, 18, 2)
            obstacle_n += 1
            continue

        ring = mask_to_polygon(inst.mask, simplify_frac=0.012, snap_tolerance_deg=16.0)
        if not ring or len(ring) < 3:
            continue
        pts = np.array(ring, dtype=np.int32)
        cv2.fillPoly(overlay, [pts], ROOF_COLOR)
        cv2.polylines(out, [pts], True, ROOF_COLOR, 2, cv2.LINE_AA)
        for x, y in ring:
            cv2.circle(out, (int(x), int(y)), 3, (0, 0, 255), -1)
        roof_n += 1
        vertex_total += len(ring)

    out = cv2.addWeighted(overlay, 0.28, out, 0.72, 0)
    avg_v = (vertex_total / roof_n) if roof_n else 0
    print(f"    roofs={roof_n} avg_vertices={avg_v:.1f} obstacles={obstacle_n}")
    return out, roof_n, obstacle_n


def main() -> None:
    parser = argparse.ArgumentParser(description="Visualize roof vectorization")
    parser.add_argument("--images", nargs="+", required=True, help="Image globs")
    parser.add_argument("--out", default=str(config.ML_DIR / "eval" / "out"))
    parser.add_argument("--model", default=str(config.MODEL_PATH))
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--imgsz", type=int, default=1024)
    args = parser.parse_args()

    paths: list[str] = []
    for pattern in args.images:
        paths.extend(sorted(glob.glob(pattern)))
    if not paths:
        raise SystemExit(f"No images matched: {args.images}")

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    segmenter = RoofSegmenter.shared(args.model)

    for path in paths:
        image = cv2.imread(path)
        if image is None:
            print(f"[skip] {path}")
            continue
        instances = segmenter.predict(image, conf=args.conf, imgsz=args.imgsz)
        print(f"[{Path(path).name}]")
        annotated, _, _ = _draw(image, instances)
        dst = out_dir / (Path(path).stem + "_pred.png")
        cv2.imwrite(str(dst), annotated)
        print(f"    -> {dst}")


if __name__ == "__main__":
    main()
