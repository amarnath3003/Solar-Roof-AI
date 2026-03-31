import base64

import cv2
import numpy as np
import pytest

from app.schemas.detection import DetectionRequest
from app.services.image_processing import analyze_snapshot


def _encode_png(image: np.ndarray) -> str:
    success, encoded = cv2.imencode(".png", image)
    assert success
    return base64.b64encode(encoded.tobytes()).decode("ascii")


def _request_payload(snapshot_base64: str, width: int, height: int) -> dict:
    return {
        "center": {"lat": 12.34, "lng": 77.59},
        "bounds": {
            "west": 77.58,
            "south": 12.33,
            "east": 77.60,
            "north": 12.35,
        },
        "snapshot_base64": snapshot_base64,
        "width": width,
        "height": height,
        "min_roof_area_px": 80,
        "min_obstacle_area_px": 5,
        "roof_confidence_threshold": 0.0,
        "obstacle_confidence_threshold": 0.0,
        "min_roof_solidity": 0.1,
        "min_roof_rectangularity": 0.05,
    }


def test_analyze_snapshot_returns_consistent_metadata() -> None:
    image = np.zeros((256, 256, 3), dtype=np.uint8)
    cv2.rectangle(image, (50, 60), (210, 200), (200, 200, 200), thickness=-1)
    cv2.rectangle(image, (100, 110), (130, 135), (60, 60, 60), thickness=-1)
    snapshot = _encode_png(image)

    request = DetectionRequest(**_request_payload(snapshot, 256, 256))
    response = analyze_snapshot(request)

    assert response.metadata.input_width == 256
    assert response.metadata.input_height == 256
    assert response.metadata.processing_ms >= 0
    assert response.metadata.filtered_roof_planes == len(response.roof_planes)
    assert response.metadata.filtered_obstacles == len(response.obstacles)
    assert response.metadata.model.startswith("opencv-edge-segmentation")

    for roof in response.roof_planes:
        ring = roof.geometry.coordinates[0]
        assert len(ring) >= 4
        assert ring[0] == ring[-1]
        assert roof.area_sq_m >= 0.0


def test_analyze_snapshot_rejects_invalid_snapshot_payload() -> None:
    request = DetectionRequest(**_request_payload("@@@this-is-not-valid-base64@@@", 64, 64))

    with pytest.raises(ValueError):
        analyze_snapshot(request)