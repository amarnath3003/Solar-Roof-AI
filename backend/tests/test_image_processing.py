import base64

import cv2
import numpy as np
import pytest

from app.schemas.detection import DetectionRequest
from app.services import image_processing
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


def test_analyze_snapshot_prioritizes_center_house_region() -> None:
    image = np.zeros((256, 256, 3), dtype=np.uint8)

    # Main house roof near center.
    cv2.rectangle(image, (92, 88), (176, 172), (195, 195, 195), thickness=-1)
    cv2.rectangle(image, (118, 116), (136, 132), (30, 30, 30), thickness=-1)

    # Neighboring roof and dark objects away from center should be deprioritized.
    cv2.rectangle(image, (12, 12), (72, 72), (190, 190, 190), thickness=-1)
    cv2.rectangle(image, (24, 24), (34, 34), (20, 20, 20), thickness=-1)

    snapshot = _encode_png(image)
    request = DetectionRequest(**_request_payload(snapshot, 256, 256))
    response = analyze_snapshot(request)

    assert response.roof_planes
    assert response.metadata.model.startswith("opencv-edge-segmentation-v3")

    for roof in response.roof_planes:
        ring = roof.geometry.coordinates[0][:-1]
        centroid_lng = sum(point[0] for point in ring) / len(ring)
        centroid_lat = sum(point[1] for point in ring) / len(ring)

        # All roof planes should remain near the selected center house.
        assert abs(centroid_lng - request.center.lng) < 0.006
        assert abs(centroid_lat - request.center.lat) < 0.006

    for obstacle in response.obstacles:
        lng, lat = obstacle.geometry.coordinates
        assert abs(lng - request.center.lng) < 0.0055
        assert abs(lat - request.center.lat) < 0.0055


def test_analyze_snapshot_uses_roboflow_svg_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    image = np.zeros((256, 256, 3), dtype=np.uint8)
    cv2.rectangle(image, (70, 72), (188, 190), (205, 205, 205), thickness=-1)
    snapshot = _encode_png(image)

    request = DetectionRequest(**_request_payload(snapshot, 256, 256))

    class DummyRoboflowClient:
        def __init__(self, api_url: str, api_key: str) -> None:
            assert api_url == "https://serverless.roboflow.com"
            assert api_key == "test-key"

        def run_workflow(self, workspace_name: str, workflow_id: str, images: dict, use_cache: bool) -> dict:
            assert workspace_name == "rooflayout"
            assert workflow_id == "detect-count-and-visualize"
            assert "image" in images
            assert use_cache is True
            return {
                "svg": (
                    "<svg width='256' height='256' xmlns='http://www.w3.org/2000/svg'>"
                    "<polygon points='78,82 182,82 182,186 78,186' confidence='0.93' label='roof-plane' />"
                    "</svg>"
                )
            }

    monkeypatch.setattr(
        image_processing,
        "_load_roboflow_settings",
        lambda: image_processing.RoboflowSettings(
            api_url="https://serverless.roboflow.com",
            api_key="test-key",
            workspace_name="rooflayout",
            workflow_id="detect-count-and-visualize",
            use_cache=True,
        ),
    )
    monkeypatch.setattr(image_processing, "InferenceHTTPClient", DummyRoboflowClient)

    response = image_processing.analyze_snapshot(request)

    assert response.roof_planes
    assert response.metadata.model.startswith("roboflow-workflow:rooflayout/detect-count-and-visualize")
    assert "ROBOFLOW_FALLBACK" not in response.metadata.warning_codes