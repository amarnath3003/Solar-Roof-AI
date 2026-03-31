# Backend - Solar Roof Detection API

FastAPI service for automatic roof inference from map snapshots.

## Run

1. Create virtual environment (optional)
2. Install dependencies:
   - `python -m pip install -r requirements.txt`
   - `python -m pip install -r requirements-dev.txt` (for tests)
3. Start server:
   - `python -m uvicorn app.main:app --reload`

## Tests

- Run from `backend`:
  - `python -m pytest`

## API

- `GET /health`
- `POST /api/v1/roof/detect`

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
