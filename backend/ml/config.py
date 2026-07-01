"""Configuration for the local roof-segmentation model and inference."""

from __future__ import annotations

import os
from pathlib import Path

ML_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ML_DIR.parent
DATA_DIR = Path(os.getenv("ROOF_ML_DATA_DIR", ML_DIR / "data"))
WEIGHTS_DIR = Path(os.getenv("ROOF_ML_WEIGHTS_DIR", ML_DIR / "weights"))
RUNS_DIR = Path(os.getenv("ROOF_ML_RUNS_DIR", ML_DIR / "runs"))

# Trained instance-seg checkpoint used at serve time. Falls back gracefully if
# absent (backend then keeps the classical OpenCV pipeline).
MODEL_PATH = Path(os.getenv("ROOF_ML_MODEL_PATH", WEIGHTS_DIR / "roof_seg.pt"))

# Class-name keywords used to route model classes into the app's two buckets.
# Matching is substring + case-insensitive, so it survives dataset renames.
ROOF_KEYWORDS = (
    "roof",
    "plane",
    "surface",
    "facet",
    "segment",
    "building",
    "rooftop",
    "slope",   # belgilabs labels roof faces as slope_flat / slope_tri / ...
    "hip",
    "gable",
)
OBSTACLE_KEYWORDS = (
    "obstacle",
    "chimney",
    "vent",
    "hvac",
    "window",
    "skylight",
    "dormer",
    "pv",
    "panel",
    "superstructure",
    "antenna",
    "shadow",
    "tree",
)

# Default inference hyper-parameters (overridable per-request).
DEFAULT_CONF = 0.25
DEFAULT_IOU = 0.45
DEFAULT_IMGSZ = 1024
DEFAULT_MAX_DET = 120


def classify_label(label: str) -> str:
    """Route a raw model class name to ``"roof"``, ``"obstacle"`` or ``"other"``."""

    name = (label or "").strip().lower()
    if any(k in name for k in OBSTACLE_KEYWORDS):
        return "obstacle"
    if any(k in name for k in ROOF_KEYWORDS):
        return "roof"
    return "other"
