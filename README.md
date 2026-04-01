# Solar Roof AI

> An interactive solar planning workspace for analyzing rooftops, estimating usable area, and previewing panel layouts.

Solar Roof AI is a portfolio project that combines a modern geospatial frontend with a FastAPI computer vision backend. The app guides a user from property search to roof analysis in a single workflow: find a building, switch into satellite view, trace or auto-detect the roof, inspect solar suitability, estimate usable area, and plan panel placement.

---

## At a Glance

| Area | What it does |
| --- | --- |
| Search | Find rooftops by address or landmark and jump straight into the workspace |
| Mapping | Draw roof geometry manually with polygons, rectangles, circles, polylines, and markers |
| Detection | Auto-detect roof planes and rooftop obstacles from captured map imagery |
| Analysis | Estimate gross, blocked, and net usable roof area |
| Solar View | Generate a heatmap based on seasonal sun exposure and obstacle shadows |
| Layout | Place solar panels manually or auto-pack them inside valid roof space |
| Export | Download roof and obstacle geometry as GeoJSON |

## Project Overview

This project is built to feel like a lightweight solar pre-sales and planning tool rather than a narrow technical demo. It mixes interactive mapping, AI-assisted detection, spatial calculations, and planning-oriented UX into one product experience.

The goal is not just to detect roofs. The goal is to make rooftop analysis feel understandable, visual, and actionable.

## Feature Highlights

### Roof-first mapping workflow

- Search for a location and jump directly into a roof-centered workspace.
- Toggle between a standard map view and high-zoom satellite imagery.
- Open the sidebar only when tools are needed, keeping the canvas clean and focused.

### AI-assisted roof detection

- Capture the active map view and send it to a FastAPI backend for analysis.
- Detect roof planes and rooftop obstacles using an OpenCV-based vision pipeline.
- Review detection results in a preview state before accepting them into the workspace.
- Adjust confidence thresholds to control how strict the detection should be.

### Solar planning tools

- Calculate roof area with gross, blocked, and net usable square footage.
- Visualize solar suitability with a heatmap informed by sun position and obstacle shadows.
- Estimate better placement zones across the roof surface instead of treating the whole roof as uniform.

### Panel layout simulation

- Place panels manually for fine-grained control.
- Auto-pack panels into the usable roof area while respecting exclusions.
- Avoid obstacle zones and invalid placements automatically.
- Surface a simple estimated system capacity based on selected panel type and count.

### Exportable output

- Export roof outlines and obstacles as GeoJSON.
- Preserve geometry that can be reused for downstream mapping or analysis workflows.

## End-to-End Flow

1. Search and select a property.
2. Enter the workspace and switch to imagery mode.
3. Trace the roof manually or run auto-detection.
4. Review and accept roof planes and obstacles.
5. Calculate usable area and inspect solar exposure.
6. Lay out panels manually or auto-pack them.
7. Export the result as GeoJSON.

## Why This Stands Out

- It combines frontend UX, geospatial interaction, and backend image analysis in one cohesive product.
- It treats AI as an assistive layer with preview and manual correction, not an opaque final answer.
- It translates real solar-planning concepts like shading, exclusions, setbacks, and usable area into an interactive tool.
- It demonstrates product thinking, not just implementation: each feature supports a realistic rooftop analysis workflow.

## Tech Stack

| Layer | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite, Leaflet, Turf.js, MapLibre |
| Backend | FastAPI, Python, OpenCV, NumPy, Pydantic |
| Data Services | OpenStreetMap Nominatim, ESRI World Imagery |

## API

- `GET /health`
- `POST /api/v1/roof/detect`

The backend detection pipeline currently uses classical computer vision techniques such as contour extraction, filtering, and morphology to estimate roof planes, obstacle points, and approximate roof orientation metadata.

## Notes

- Roof pitch, aspect, and solar suitability values are estimation-grade and intended for planning, not engineering approval.
- Auto-detection quality depends heavily on imagery clarity, roof contrast, and visible rooftop boundaries.
- Manual mapping remains available when screenshot-based imagery capture is limited by browser or tile CORS behavior.

## Development

```bash
npm install --workspace frontend
npm run backend:install
npm run frontend:dev
npm run backend:dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:8000`
