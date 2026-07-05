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
| `ml/train.py` | train YOLO11-seg; archive every best.pt under `ml/weights/archive/` and promote it to `ml/weights/roof_seg.pt` (+ `.json` metadata) when it clears `--min-map`. |
| `ml/evaluate.py` | quantitative eval: box + mask mAP via `model.val()`, optional vectorizer vertex stats. |
| `ml/predict_viz.py` | overlay vectorized outlines on images (the eyeball test). |
| `app/services/ml_detector.py` | instances → geo-referenced `DetectionResponse` (reuses `image_processing` geo helpers). |

At serve time, `app/services/image_processing.analyze_snapshot` uses the model
when `ml/weights/roof_seg.pt` exists, else falls back to the classical OpenCV
pipeline. **No external services are contacted.**

Serve-time behavior worth knowing:

- The FastAPI lifespan hook **warms the model up at startup**; `GET /health`
  reports `ml_model_loaded` so a fallback-only server is visible.
- Inference reads `ml/weights/roof_seg.json` (written at promotion) and runs at
  the **same imgsz the checkpoint was trained at** — no train/serve mismatch.
- Predictions on the shared model are serialized behind a lock (torch inference
  is not thread-safe across FastAPI's threadpool).
- ML failures log a full traceback and degrade to OpenCV with an `ML_FALLBACK`
  warning code in the response.

## Setup (one-time)

Two environments on this machine:

- **Training** — global Python 3.10 with CUDA torch (RTX 3070). Run `ml.train`
  / heavy `ml.evaluate` here.
- **Serving** — `backend/.venv` (Python 3.11) with CPU torch; plenty for
  per-request inference (~0.5s per 640px tile) and CI tests.

```bash
# Training env (CUDA). Install torch FIRST so ultralytics does not choose:
python -m pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
python -m pip install -r requirements.txt   # ultralytics, shapely, fastapi, ...
python -c "import torch; print(torch.cuda.is_available())"   # must print True

# Serving venv (CPU torch is fine):
.venv/Scripts/python -m pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu
.venv/Scripts/python -m pip install -r requirements.txt
```

(`--no-cache-dir` matters: pip 23.x hits a MemoryError caching the multi-GB
CUDA wheel.)

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
# best.pt is archived to ml/weights/archive/roof_seg_v1_<UTC>.pt (+ .json) and
# promoted to ml/weights/roof_seg.pt + roof_seg.json (metadata: imgsz, metrics).

# Resume an interrupted run:
python -m ml.train --data ml/data/roof_merged/data.yaml --name roof_seg_v1 --resume

# Only promote when mask mAP50 clears a bar (older serving model kept otherwise):
python -m ml.train --data ml/data/roof_merged/data.yaml --name roof_seg_v2 --min-map 0.55

# Bit-exact reproducibility (slower): add --deterministic --seed 0
```

Rollback: copy an archived `.pt`/`.json` pair over
`ml/weights/roof_seg.pt` / `roof_seg.json` and restart the backend.

RTX 3070 8GB: AutoBatch settles to ~batch 4 @ imgsz 768. Drop to `--imgsz 640`
for a larger batch / faster epochs, or use `yolo11m-seg.pt` for higher quality
if VRAM allows.

## Evaluate

```bash
# Quantitative: box + mask mAP against labeled ground truth (val or test split).
python -m ml.evaluate --data ml/data/roof_merged/data.yaml --split test
# add --vectorize-samples 25 to also print avg vertices/roof on real predictions
# add --weights ml/weights/archive/<...>.pt to compare an older checkpoint

# Visual: overlay vectorized outlines on images (the eyeball test).
python -m ml.predict_viz --images "ml/data/roof_merged/test/images/*.jpg" --out ml/eval/out
```

## Status / next steps

- [x] Vectorizer (unit-tested in `tests/test_vectorize.py`: rotated rect → 4 verts, L-shape → 6, axis snapping, area sanity).
- [x] GPU stack (torch 2.6.0+cu124, ultralytics, shapely).
- [x] Satellite-only merged dataset.
- [x] Backend integration (Roboflow removed; ML-first with OpenCV fallback, startup warmup, /health ML status, thread-safe inference).
- [x] Checkpoint versioning + metadata + `--min-map` promotion gate; serve imgsz follows training imgsz.
- [x] Quantitative eval script (`ml/evaluate.py`, box + mask mAP).
- [~] Training iteration 1 (`roof_seg_v1`) — resumable; promote via `python -m ml.train ... --resume`.
- [ ] After training: `python -m ml.evaluate --data ml/data/roof_merged/data.yaml --split test`, then tune conf / vectorizer tol on real Google-satellite samples.
- [ ] Fold in more nadir Roboflow datasets (research agent shortlist).
