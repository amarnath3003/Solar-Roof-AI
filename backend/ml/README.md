# Local Roof Segmentation ML

In-house instance-segmentation model + polygon regularizer that **replaces the
external Roboflow dependency**. It detects roof planes and rooftop obstacles on
top-down satellite imagery and emits clean, vector-like **straight-line**
outlines (not blobby raster traces).

```
snapshot ──> YOLO11-seg (roof / obstacle masks) ──> vectorize.py ──> straight-line polygons ──> DetectionResponse
```

## Layout

| Path | Role |
|---|---|
| `ml/vectorize.py` | mask → contour → Douglas-Peucker → dominant-axis edge snapping (0/45/90) → shapely cleanup. The "straight vector line" core. Pure numpy/cv2, no torch. |
| `ml/inference.py` | `RoofSegmenter` — lazy, thread-safe YOLO-seg wrapper. Pixels only. |
| `ml/config.py` | paths, class-keyword routing (`roof` / `obstacle`), inference defaults. |
| `ml/datasets/prepare.py` | download Roboflow datasets (REST, no SDK) + merge into one `{roof, obstacle}` YOLO-seg dataset. |
| `ml/train.py` | train YOLO11-seg, copy best → `ml/weights/roof_seg.pt`. |
| `ml/predict_viz.py` | overlay vectorized outlines on images (the eyeball test). |
| `app/services/ml_detector.py` | instances → geo-referenced `DetectionResponse` (reuses `image_processing` geo helpers). |

At serve time, `app/services/image_processing.analyze_snapshot` uses the model
when `ml/weights/roof_seg.pt` exists, else falls back to the classical OpenCV
pipeline. **No external services are contacted.**

## Setup (one-time)

```bash
# GPU torch (RTX 3070 / CUDA). requirements.txt's ultralytics pulls CPU torch by
# default, so install the CUDA build explicitly FIRST:
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
python -m pip install -r requirements.txt   # ultralytics, shapely, fastapi, ...
python -c "import torch; print(torch.cuda.is_available())"   # must print True
```

## Data

Satellite / **nadir only**. Facade / street-level / oblique datasets are
excluded on purpose (they poison a top-down detector). Current sources
(see `DEFAULT_SOURCES` in `datasets/prepare.py`):

- `belgilabs/roof-segmentation-pjlms` v1 — 2876 imgs, per-plane roof faces (aerial survey).
- `vec-bvgxj/roof-segmentation-zytzo` v4 — 895 imgs, roof + skylight/solar (nadir tiles).

```bash
# Needs a Roboflow key (read from ROBOFLOW_API_KEY env, or frontend/.env). Never committed.
ROBOFLOW_API_KEY=xxxx python -m ml.datasets.prepare
# -> ml/data/roof_merged/data.yaml   (train=3199, valid=87, test=49 after satellite filter)
```

## Train

```bash
python -m ml.train --data ml/data/roof_merged/data.yaml --model yolo11s-seg.pt \
    --epochs 100 --imgsz 768 --batch -1 --name roof_seg_v1
# best.pt is auto-copied to ml/weights/roof_seg.pt

# Resume an interrupted run:
python -m ml.train --data ml/data/roof_merged/data.yaml --name roof_seg_v1 --resume
```

RTX 3070 8GB: AutoBatch settles to ~batch 4 @ imgsz 768. Drop to `--imgsz 640`
for a larger batch / faster epochs, or use `yolo11m-seg.pt` for higher quality
if VRAM allows.

## Evaluate

```bash
python -m ml.predict_viz --images "ml/data/roof_merged/test/images/*.jpg" --out ml/eval/out
# prints avg vertices/roof (want few, straight) and writes overlays
```

## Status / next steps

- [x] Vectorizer (validated: noisy rotated rect → 4 clean verts snapped to axis; L-shape → 6).
- [x] GPU stack (torch 2.6.0+cu124, ultralytics, shapely).
- [x] Satellite-only merged dataset.
- [x] Backend integration (Roboflow removed; ML-first with OpenCV fallback).
- [~] Training iteration 1 (`roof_seg_v1`) — running / resumable.
- [ ] Evaluate on real Google-satellite samples; tune conf / imgsz / vectorizer tol.
- [ ] Fold in more nadir Roboflow datasets (research agent shortlist).
- [ ] Repoint the frontend from the direct Roboflow call to `POST /api/v1/roof/detect`.
