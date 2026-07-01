"""Load the trained instance-seg model and return raw roof/obstacle instances.

Kept deliberately geometry-agnostic: this module only knows pixels. Converting
instances into the API's geo-referenced ``DetectionResponse`` lives in
``app.services.ml_detector`` so the model layer has no web/schema dependency.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional

import cv2
import numpy as np

from ml import config


@dataclass
class Instance:
    label: str          # raw model class name
    category: str       # "roof" | "obstacle" | "other"
    confidence: float
    mask: np.ndarray    # full-resolution uint8 mask (0/255), shape (H, W)
    bbox: tuple         # (x, y, w, h) in pixels


class RoofSegmenter:
    """Thread-safe lazy wrapper around an Ultralytics YOLO-seg checkpoint."""

    _instances: dict = {}
    _lock = threading.Lock()

    def __init__(self, model_path: Optional[Path] = None):
        self.model_path = Path(model_path or config.MODEL_PATH)
        self._model = None
        self._device = None

    @classmethod
    def shared(cls, model_path: Optional[Path] = None) -> "RoofSegmenter":
        key = str(Path(model_path or config.MODEL_PATH))
        with cls._lock:
            if key not in cls._instances:
                cls._instances[key] = cls(model_path)
            return cls._instances[key]

    def available(self) -> bool:
        return self.model_path.exists()

    def _ensure_model(self):
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            if not self.model_path.exists():
                raise FileNotFoundError(f"Model checkpoint not found: {self.model_path}")
            from ultralytics import YOLO  # imported lazily; heavy dependency

            try:
                import torch

                self._device = 0 if torch.cuda.is_available() else "cpu"
            except Exception:
                self._device = "cpu"
            self._model = YOLO(str(self.model_path))

    def predict(
        self,
        image_bgr: np.ndarray,
        *,
        conf: float = config.DEFAULT_CONF,
        iou: float = config.DEFAULT_IOU,
        imgsz: int = config.DEFAULT_IMGSZ,
        max_det: int = config.DEFAULT_MAX_DET,
    ) -> List[Instance]:
        self._ensure_model()
        height, width = image_bgr.shape[:2]

        results = self._model.predict(
            source=image_bgr,
            conf=conf,
            iou=iou,
            imgsz=imgsz,
            max_det=max_det,
            device=self._device,
            retina_masks=True,   # full-resolution masks -> cleaner vectorization
            verbose=False,
        )
        if not results:
            return []

        result = results[0]
        if result.masks is None or result.boxes is None:
            return []

        names = result.names
        masks = result.masks.data.cpu().numpy()      # (N, h, w) in [0,1]
        boxes = result.boxes
        classes = boxes.cls.cpu().numpy().astype(int)
        confs = boxes.conf.cpu().numpy()

        instances: List[Instance] = []
        for i in range(masks.shape[0]):
            mask = masks[i]
            if mask.shape[:2] != (height, width):
                mask = cv2.resize(mask, (width, height), interpolation=cv2.INTER_LINEAR)
            binary = (mask > 0.5).astype(np.uint8) * 255
            if int(binary.sum()) == 0:
                continue

            label = str(names.get(int(classes[i]), str(classes[i])))
            xs, ys = np.where(binary > 0)
            if xs.size == 0:
                continue
            y0, y1 = int(xs.min()), int(xs.max())
            x0, x1 = int(ys.min()), int(ys.max())

            instances.append(
                Instance(
                    label=label,
                    category=config.classify_label(label),
                    confidence=float(confs[i]),
                    mask=binary,
                    bbox=(x0, y0, x1 - x0 + 1, y1 - y0 + 1),
                )
            )

        return instances
