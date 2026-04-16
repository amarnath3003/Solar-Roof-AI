# ☀️ Solar Roof AI

> An interactive solar planning workspace for rooftop mapping, AI-assisted roof detection, panel layout simulation, and financial estimation.

Solar Roof AI is currently running as a **frontend-only React + TypeScript** geospatial workspace with **direct Roboflow hosted workflow** integration for auto-detection. It is designed to feel like a lightweight solar pre-sales planning product: users can search a property, draw or detect roof geometry, analyze usable area and exposure, simulate panel placement, and export results.

---

## 📸 Screenshots

Get a visual tour of Solar Roof AI in action:

| Workspace Overview | Blueprint | PDF Report |
|---|---|---|
| ![Workspace](frontend/src/screenshots/localhost_5173_(pc%201920).png) | ![Blueprint](frontend/src/screenshots/localhost_5173_(pc%201920)%20(2).png) | ![PDF Report](frontend/src/screenshots/solar%20ss.png) |

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
- **Send directly to Roboflow hosted workflow** for analysis
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
- 🤖 **Detection workflow** orchestration (snapshot → Roboflow workflow → preview/apply)
- ⚙️ **Panel layout** logic and worker offloading
- ☀️ **Solar heatmap** visualization
- 💰 **Financial dashboard** components

### Hosted Detection (Roboflow Workflow)

- ☁️ **Serverless hosted workflow** called directly from the browser
- 🧾 **Structured output parsing** from `svg_output` and `json_output`
- 📋 **Metadata shaping** into app-compatible roof/obstacle results

## 🛠️ Tech Stack

| Layer | Stack |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Leaflet, Turf.js, Recharts |
| **Detection** | Roboflow Hosted Workflow API |
| **External Data** | OpenStreetMap Nominatim, ESRI World Imagery |

## 📂 Monorepo Structure

```
.
├── frontend/        # React + Vite app (map UI, planning workflow)
├── backend/         # Legacy/optional backend (not required for current frontend runtime)
├── README.md
└── package.json     # root workspace scripts
```

## 🔌 Detection API Summary

Current runtime uses Roboflow hosted workflow directly:

```
POST https://serverless.roboflow.com/<workspace>/workflows/<workflow_id>
```

**Request body includes:**
- `api_key`
- `inputs.image` as base64 or URL

**Response includes:**
- `predictions`
- `json_output`
- `svg_output`

## 🚀 Local Development

### Prerequisites

- **Node.js** 20+

### Quick Start

**Install dependencies:**
```bash
npm install --workspace frontend
```

**Run frontend app:**
```bash
npm run frontend:dev
```

Set frontend env variables for detection:

- `VITE_ROBOFLOW_API_URL=https://serverless.roboflow.com`
- `VITE_ROBOFLOW_WORKSPACE=rooflayout`
- `VITE_ROBOFLOW_WORKFLOW_ID=detect-count-and-visualize`
- `VITE_ROBOFLOW_API_KEY=...`

**Services:**
- 🌐 **Frontend:** http://localhost:5173

## 📋 Workspace Scripts (Root)

| Command | Action |
|---|---|
| `npm run dev` | Start frontend dev server |
| `npm run build` | Build frontend for production |
| `npm run preview` | Preview frontend build |
| `npm run frontend:dev` | Explicit frontend dev command |

## ⚠️ Limitations and Assumptions

- 🖼️ Detection quality depends on imagery quality, zoom, and roof contrast
- 📐 Pitch/aspect/height values are estimation-grade from 2D imagery
- 🎯 Results are suitable for planning and pre-sales exploration, not permit-ready engineering
- ✏️ Manual edits remain essential for edge cases and complex roof geometries

## 🔮 Future Improvements

- 🧠 Stronger model-based detection beyond classical CV heuristics
- 📏 More explicit setback and code-rule constraints for panel placement
- 📈 Time-series irradiance simulation and seasonal production profiles
- 🔐 Authentication, saved projects, and collaboration workflows

## 📄 License

No license file is currently included in this repository. Add a LICENSE file before production or commercial distribution.
