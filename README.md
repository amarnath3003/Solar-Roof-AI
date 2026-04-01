# Solar Roof AI

Solar Roof AI is a portfolio project that turns rooftop imagery into an interactive solar planning workspace. It combines a polished map-based frontend with a FastAPI computer vision service so a user can search for a property, trace or auto-detect roof geometry, inspect solar suitability, estimate usable roof area, and preview panel placement in one flow.

## Overview

This project is designed to feel like a lightweight solar pre-sales and planning tool rather than just a demo. The experience centers around a roof-focused workspace where users can move from address lookup to roof analysis to exportable planning data with minimal friction.

## Key Features

- Address search with rooftop-focused map navigation using OpenStreetMap geocoding.
- Dual map modes with both a standard basemap and high-zoom satellite imagery.
- Manual roof mapping with polygons, rectangles, circles, polylines, and obstacle markers.
- Auto roof detection from captured map imagery using a FastAPI + OpenCV backend.
- Detection preview flow with accept/reject controls before committing AI-generated geometry.
- Confidence-based roof and obstacle filtering for tuning detection sensitivity.
- Roof area estimation with gross, blocked, and net usable square footage.
- Solar heatmap overlay that blends sun exposure, seasonal sweep, and obstacle shadow impact.
- Panel planning tools with manual stamping or automatic panel packing inside usable roof space.
- Obstacle-aware exclusion zones so panel placement avoids blocked areas.
- GeoJSON export for roof outlines, obstacles, and analysis-ready geometry.

## Product Workflow

1. Search and select a property.
2. Open the workspace and switch into imagery view.
3. Map the roof manually or run auto-detection on a captured satellite snapshot.
4. Review the detected roof planes and obstacles before accepting them.
5. Calculate usable roof area and inspect the solar exposure overlay.
6. Lay out panels manually or auto-pack them based on available space.
7. Export the resulting roof and obstacle data as GeoJSON.

## Why This Project Is Interesting

- It blends frontend interaction design, geospatial data handling, and backend computer vision in a single product.
- It uses AI-assisted detection as a practical productivity feature rather than a black-box gimmick.
- It keeps the human in control through preview, manual editing, and exportable geometry.
- It demonstrates how solar planning concepts like setbacks, obstacle clearance, shading, and capacity estimation can be translated into an intuitive UI.

## Tech Stack

- Frontend: React, TypeScript, Vite, Leaflet, Turf.js, MapLibre, Tailwind-based UI styling
- Backend: FastAPI, Python, OpenCV, NumPy, Pydantic
- External services: OpenStreetMap Nominatim geocoding, ESRI World Imagery tiles

## Backend API

- `GET /health` for service health
- `POST /api/v1/roof/detect` for roof and obstacle detection from a map snapshot

The detection pipeline currently uses classical computer vision techniques such as contour extraction, filtering, and morphology to estimate roof planes, obstacles, and approximate roof orientation metadata.

## Notes

- Roof pitch, aspect, and solar suitability values are estimation-grade and should be treated as planning aids, not engineering outputs.
- Auto-detection quality depends on the clarity of the source imagery and the visible roof contrast.
- Some locations may block screenshot-based imagery capture because of tile or browser CORS restrictions, in which case the manual workflow still works.

## Development

Install dependencies:

```bash
npm install --workspace frontend
npm run backend:install
```

Run locally:

```bash
npm run frontend:dev
npm run backend:dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
