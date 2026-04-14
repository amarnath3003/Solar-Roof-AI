# ☀️ Solar Roof AI

> An interactive solar planning workspace for rooftop mapping, AI-assisted roof detection, panel layout simulation, and financial estimation.

Solar Roof AI combines a **React + TypeScript** geospatial frontend with a **FastAPI + OpenCV** backend. It is designed to feel like a lightweight solar pre-sales planning product: users can search a property, draw or detect roof geometry, analyze usable area and exposure, simulate panel placement, and export results.

---

## 📸 Screenshots

Get a visual tour of Solar Roof AI in action:

| Workspace Overview | Detection & Planning | Financial Dashboard |
|---|---|---|
| ![Workspace](frontend/src/screenshots/solar%20ss.png) | ![Detection](frontend/src/screenshots/localhost_5173_(pc%201920).png) | ![Financial](frontend/src/screenshots/localhost_5173_(pc%201920)%20(2).png) |

---

## 💡 Why This Project Exists

Solar feasibility tools are often fragmented across GIS software, internal spreadsheets, and engineering workflows. This project demonstrates how a single app can guide users from location discovery to actionable planning output, while keeping AI suggestions reviewable and editable.

This is not just a detection demo. It's a complete product-style workflow that balances:

✨ Interactive map UX  
🤖 Assistive computer vision  
📐 Geospatial calculations  
💰 Planning and financial context

## ⚡ Core Features

### 1️⃣ Property Search and Workspace Entry

- **Address and place search** for fast rooftop lookup
- **Map-first workspace** centered on the selected property
- **Satellite-first analysis flow** for visual roof clarity

### 2️⃣ Roof and Obstacle Mapping Tools

- **Manual drawing** with interactive map editing tools
- **Separate editable layers** for roof polygons and obstacles
- **Support for irregular shapes** and exclusion zones

### 3️⃣ AI-Assisted Roof Detection

- **Capture map snapshots** from the frontend
- **Send to FastAPI detection** endpoint for analysis
- **Detect roof planes and obstacles** from imagery
- **Preview before applying** detections to workspace
- **Tune confidence thresholds** and area filters for precision

### 4️⃣ Roof Area and Suitability Analysis

- **Compute roof metrics:** gross area, blocked area, net usable area
- **Estimate roof orientation** metrics from image-driven candidates
- **Generate warnings** when detections need review

### 5️⃣ Solar Exposure Heatmap

- **Solar overlay** based on sun position and roof context
- **Visual zones** showing stronger and weaker exposure areas
- **Planning-grade guidance** for pre-sales exploration

### 6️⃣ Panel Layout Simulation

- **Manual panel placement** for fine control
- **Auto-pack mode** to maximize panel placement
- **Panel type selection** with capacity-aware counting
- **Worker-based operations** for responsive UI
- **Placement validation** to prevent overlaps and invalid placements

### 7️⃣ Financial Planning Layer

- **System sizing inputs** and planning assumptions
- **Capacity-linked estimation** driven by placed panels
- **Dashboard and chart overlays** for scenario feedback

### 8️⃣ Export and Reporting

- **GeoJSON export** of roof and obstacle geometry
- **Blueprint-style reports** for planning handoff

## 🎯 End-to-End User Flow

1. 🔍 Search for a property
2. 🗺️ Enter the map workspace and switch to imagery mode if needed
3. 🏗️ Draw roof and obstacles manually, or run auto-detection
4. ✅ Review detection results and accept only what looks correct
5. 📊 Calculate usable roof area and inspect solar heatmap hints
6. 📦 Simulate panel placement manually or with auto-pack
7. 💵 Review estimated system capacity and financial outcomes
8. 📤 Export geometry/report artifacts

## 🏗️ Architecture

### Frontend (Vite + React + TypeScript)

- 🗺️ **Interactive mapping** and draw/edit UX
- 🔎 **Address search** integration
- 🤖 **Detection workflow** orchestration (snapshot → API → preview/apply)
- ⚙️ **Panel layout** logic and worker offloading
- ☀️ **Solar heatmap** visualization
- 💰 **Financial dashboard** components

### Backend (FastAPI + OpenCV)

- 📡 **Detection API** with request validation via Pydantic models
- 🖼️ **Image decoding** and quality scoring
- 🔍 **Roof candidate** extraction using contour + morphology pipeline
- 🚫 **Obstacle candidate** extraction and filtering
- 📈 **Confidence scoring** and truncation logic
- 📋 **Metadata output** including warning codes and estimated fields

## 🛠️ Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Leaflet, Turf.js, Recharts |
| **Backend** | FastAPI, Pydantic v2, OpenCV, NumPy, Uvicorn |
| **External Data** | OpenStreetMap Nominatim, ESRI World Imagery |

## 📂 Monorepo Structure

```
.
├── frontend/        # React + Vite app (map UI, planning workflow)
├── backend/         # FastAPI detection service
├── README.md
└── package.json     # root workspace scripts
```

## 🔌 API Summary

### Health Check
```
GET /health
```

### Roof & Obstacle Detection
```
POST /api/v1/roof/detect
```

**Detection request includes:**
- Map center and bounds
- Base64 map snapshot
- Snapshot dimensions and zoom
- Detection thresholds and limits

**Detection response includes:**
- `roof_planes[]` - Detected roof plane polygons
- `obstacles[]` - Detected rooftop obstacles
- `metadata` - Candidate counts, filtered counts, warnings, estimated metrics

## 🚀 Local Development

### Prerequisites

- Node.js 20+
- Python 3.10+

### Install

```bash
npm install --workspace frontend
npm run backend:install
python -m pip install -r backend/requirements-dev.txt
```

### Run both apps

```bash
npm run frontend:dev
npm run backend:dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- API docs: http://localhost:8000/docs

### Test backend

```bash
cd backend
python -m pytest
```

## Workspace Scripts (Root)

- npm run dev -> starts frontend dev server
- npm run build -> builds frontend
- npm run preview -> previews frontend build
- npm run frontend:dev -> explicit frontend dev command
- npm run backend:install -> installs backend runtime deps
- npm run backend:dev -> starts FastAPI with reload

## Limitations and Assumptions

- Detection quality depends on imagery quality, zoom, and roof contrast.
- Pitch/aspect/height values are estimation-grade from 2D imagery.
- Results are suitable for planning and pre-sales exploration, not permit-ready engineering.
- Manual edits remain essential for edge cases and complex roof geometries.

## Future Improvements

- Stronger model-based detection beyond classical CV heuristics.
- More explicit setback and code-rule constraints for panel placement.
- Time-series irradiance simulation and seasonal production profiles.
- Authentication, saved projects, and collaboration workflows.

## License

No license file is currently included in this repository. Add a LICENSE file before production or commercial distribution.
