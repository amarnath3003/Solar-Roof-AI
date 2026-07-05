# Backend - Solar Roof Detection API

FastAPI service for automatic roof inference from map snapshots.

## Run

1. Create virtual environment (optional)
2. Install dependencies (torch FIRST so ultralytics doesn't pull the CPU build):
   - GPU: `python -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124`
   - `python -m pip install -r requirements.txt`
   - `python -m pip install -r requirements-dev.txt` (for tests)
3. Start server:
   - `python -m uvicorn app.main:app --reload`

Environment:

- `CORS_ORIGINS` — comma-separated allowed origins (default: localhost:5173).
- `LOG_LEVEL` — python logging level (default INFO).
- `ROOF_ML_MODEL_PATH` — override the serving checkpoint path.

`GET /health` reports `ml_model_loaded`; when false the server is running the
OpenCV fallback only (no trained checkpoint, or the checkpoint failed to load).

## Tests

- Run from `backend`:
  - `python -m pytest`

## API

- `GET /health`
- `POST /api/v1/roof/detect`

## Detection Pipeline

The detection endpoint prefers the local YOLO11-seg model when a trained checkpoint exists at `ml/weights/roof_seg.pt`, and falls back to the classical OpenCV segmentation pipeline otherwise (or if the ML path fails). See `ml/README.md` for training and checkpoint details.

When the ML path is active, response metadata `model` identifies the local segmentation model; fallback responses include the `ML_FALLBACK` warning code.

### Request payload

```json
{
  "center": { "lat": 12.34, "lng": 56.78 },
  "bounds": { "west": 56.77, "south": 12.33, "east": 56.79, "north": 12.35 },
  "snapshot_base64": "<base64 image>",
  "width": 1024,
  "height": 768,
   "zoom": 19,
   "roof_confidence_threshold": 0.45,
   "obstacle_confidence_threshold": 0.4,
   "min_roof_area_px": 500,
   "min_obstacle_area_px": 35,
   "max_roof_planes": 12,
   "max_obstacles": 40
}
```


### Response metadata highlights

- `filtered_roof_planes` and `filtered_obstacles`: kept detections after refinement.
- `warning_codes`: machine-readable quality/truncation warnings.
- `warnings`: human-readable warning messages.
- `estimated_metrics`: fields that are approximation-grade from 2D imagery.
