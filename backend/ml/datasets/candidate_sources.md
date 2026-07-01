# More nadir Roboflow datasets to fold in (next iteration)

All verified: exist (no 404), `type: instance-segmentation`, and a sample thumbnail
confirmed **top-down/nadir**. Add promising ones to `DEFAULT_SOURCES` in `prepare.py`
(classes auto-route via keyword: `building`/`house`/`rooftop` → roof). Re-inspect a
sample image before committing (see [[satellite-nadir-only]] rule).

## Tier 1 — roof-focused, clearly nadir
| workspace | project | ver | imgs | classes |
|---|---|---|---|---|
| building-detection-1ny5t | aerial-image-detection | 6 | 737 | house |
| satellite-rooftop-map | satellite-rooftop-map | 3 | 462 | Rooftops |
| otofare | rooftop-segmentation-qttqu-4dlkw | 2 | 131 | rooftop (Google sat) |
| devik | rooftop-detection-eqtsl | 17 | 101 | rooftop (split is lopsided 17/70/14 — check) |

## Tier 2 — nadir building footprints (filter to building class)
| workspace | project | ver | imgs | classes |
|---|---|---|---|---|
| robotrial | building-footprint-extract | 7 | 585 | building, edge |
| conversion-qmb4v | aerial-segmentation-3 | 1 | 1506 | building, road, vegetation |
| roboflow-universe-projects | buildings-instance-segmentation | 4 | 9665 | Building (largest) |
| yolo-datasets-ymdve | satellite-segmentation-datasets | 1 | 275 | building, tree, road, river |

## Rejected — DO NOT USE (facade / non-imagery / wrong task)
- `roof-segmentation-smovm/roof-segmentation-qmhbb` — street-level facade (same workspace as the dropped roof-seg-2).
- `kyteai/house-parts`, `elevation/elevation3` — facade / elevation blueprint.
- `rooftics/dataset-fork-1` — ideal per-plane slope classes + nadir, but `versions: []` (nothing downloadable yet; watch it).
- `geogov2/solar-panel-detection-mhwvc`, `test-0sjkr/rooftop-solar-panels-r6k2a` — semantic, not instance.
- `brad-dwyer/aerial-solar-panels`, `mal-vmmbi/aerial-solar-panels-9b7yw` — bbox object-detection, not polygons.

Caveat: none of these have per-plane + obstacle labels like the current two sets —
they are whole-roof / footprint outlines. Good for outline generalization, not ridge lines.
