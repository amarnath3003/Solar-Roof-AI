from pydantic import ValidationError
import pytest

from app.schemas.detection import DetectionRequest


def _base_payload() -> dict:
    return {
        "center": {"lat": 12.34, "lng": 77.59},
        "bounds": {
            "west": 77.58,
            "south": 12.33,
            "east": 77.60,
            "north": 12.35,
        },
        "snapshot_base64": "a" * 24,
        "width": 512,
        "height": 512,
    }


def test_detection_request_accepts_valid_payload() -> None:
    payload = _base_payload()

    request = DetectionRequest(**payload)

    assert request.width == 512
    assert request.height == 512


def test_detection_request_rejects_invalid_bounds_order() -> None:
    payload = _base_payload()
    payload["bounds"] = {
        "west": 77.60,
        "south": 12.33,
        "east": 77.58,
        "north": 12.35,
    }

    with pytest.raises(ValidationError, match="west < east"):
        DetectionRequest(**payload)


def test_detection_request_rejects_center_outside_bounds() -> None:
    payload = _base_payload()
    payload["center"] = {"lat": 13.00, "lng": 78.00}

    with pytest.raises(ValidationError, match="Center coordinate must lie within the provided map bounds."):
        DetectionRequest(**payload)


def test_detection_request_rejects_invalid_area_relationship() -> None:
    payload = _base_payload()
    payload["min_roof_area_px"] = 80
    payload["min_obstacle_area_px"] = 100

    with pytest.raises(ValidationError, match="min_obstacle_area_px must be smaller than min_roof_area_px."):
        DetectionRequest(**payload)