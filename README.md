# Solar-Roof-AI Workspace

Monorepo-style workspace with:
- frontend: React + Vite map workspace
- backend: FastAPI roof detection service using OpenCV image processing

## Quick Start

1. Install frontend dependencies
   - `npm install --workspace frontend`
2. Install backend dependencies
   - `npm run backend:install`
3. Start frontend
   - `npm run frontend:dev`
4. Start backend
   - `npm run backend:dev`

Frontend runs on `http://localhost:5173`.
Backend runs on `http://localhost:8000`.

## Detection Endpoint

- `POST /api/v1/roof/detect`
- Health check: `GET /health`

### Detection request controls

- `roof_confidence_threshold`: Minimum confidence for roof planes.
- `obstacle_confidence_threshold`: Minimum confidence for obstacles.
- `min_roof_area_px` / `min_obstacle_area_px`: Pixel-area filters.
- `max_roof_planes` / `max_obstacles`: Max detections returned.
- `min_roof_solidity` / `min_roof_rectangularity`: Shape quality filters.

The backend currently uses an OpenCV pipeline (edge detection + contour extraction + morphology) to estimate:
- roof plane polygons
- obstacle points
- slope/aspect approximations

Detection metadata includes:
- input snapshot dimensions used by backend
- filtered vs raw candidate counts
- warning codes for low quality, truncation, and filtering outcomes

Slope values are estimation-grade from 2D imagery and should be treated as approximate.
