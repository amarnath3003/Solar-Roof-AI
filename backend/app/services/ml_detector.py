"""Convert local model instances into the API's geo-referenced DetectionResponse.

This is the replacement for the Roboflow path: it drives the in-house
instance-segmentation model, straightens every roof mask into a vector outline,
and reuses the geo/measurement helpers that already back the OpenCV pipeline.
"""

from __future__ import annotations

import math
import time
import uuid
from typing import List, Optional, Tuple

import cv2
import numpy as np

from app.schemas.detection import (
    DetectionMetadata,
    DetectionRequest,
    DetectionResponse,
    Obstacle,
    PointGeometry,
    PolygonGeometry,
    RoofPlane,
)
from app.services.image_processing import (
    PixelToGeoContext,
    _area_px_to_sq_m,
    _bbox_iou,
    _estimate_slope,
    _image_quality_score,
    _pixel_to_geo,
    _prepare_grayscale,
)
from ml.vectorize import mask_to_polygon, polygon_area_px

_MODEL_NAME = "roof-seg-yolo11-local"


def model_available() -> bool:
    """True when a trained checkpoint exists on disk."""

    try:
        from ml.inference import RoofSegmenter

        return RoofSegmenter.shared().available()
    except Exception:
        return False


def analyze_snapshot_ml(
    req: DetectionRequest,
    image: np.ndarray,
    source_width: int,
    source_height: int,
    started: float,
    warning_codes: List[str],
    warnings: List[str],
) -> DetectionResponse:
    from ml.inference import RoofSegmenter

    segmenter = RoofSegmenter.shared()
    gray = _prepare_grayscale(image)
    image_quality = _image_quality_score(gray)

    instances = segmenter.predict(
        image,
        conf=min(req.roof_confidence_threshold, req.obstacle_confidence_threshold, 0.25),
        imgsz=_infer_imgsz(source_width, source_height),
    )

    ctx = PixelToGeoContext(
        width=source_width,
        height=source_height,
        west=req.bounds.west,
        south=req.bounds.south,
        east=req.bounds.east,
        north=req.bounds.north,
    )

    roof_raw: List[Tuple[RoofPlane, Tuple[int, int, int, int], float]] = []
    obstacle_raw: List[Tuple[Obstacle, float]] = []
    roof_candidate_count = 0
    obstacle_candidate_count = 0

    for inst in instances:
        if inst.category == "obstacle":
            obstacle_candidate_count += 1
            obstacle = _build_obstacle(inst, req, ctx, source_width, source_height)
            if obstacle is not None:
                obstacle_raw.append((obstacle, inst.confidence))
            continue

        # Treat "roof" and unknown/"other" masks as roof planes; the model was
        # trained on roofs so an unmatched class is far more likely a roof face.
        roof_candidate_count += 1
        plane_bbox = _build_roof_plane(inst, req, ctx, gray, source_width, source_height)
        if plane_bbox is not None:
            roof_raw.append(plane_bbox)

    roof_planes = _dedupe_and_rank(roof_raw, req.max_roof_planes)
    obstacle_raw.sort(key=lambda item: item[1], reverse=True)
    obstacles = [obs for obs, _ in obstacle_raw[: req.max_obstacles]]

    _append_warnings(
        warning_codes,
        warnings,
        roof_candidate_count,
        obstacle_candidate_count,
        len(roof_planes),
        len(obstacles),
        req,
        image_quality,
    )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    metadata = DetectionMetadata(
        processing_ms=elapsed_ms,
        roof_candidates=roof_candidate_count,
        obstacle_candidates=obstacle_candidate_count,
        filtered_roof_planes=len(roof_planes),
        filtered_obstacles=len(obstacles),
        model=_MODEL_NAME,
        image_quality=image_quality,
        input_width=source_width,
        input_height=source_height,
        warning_codes=warning_codes,
        warnings=warnings,
        estimated_metrics=["estimated_pitch_degrees", "aspect_degrees", "estimated_height_m"],
    )
    return DetectionResponse(roof_planes=roof_planes, obstacles=obstacles, metadata=metadata)


def _infer_imgsz(width: int, height: int) -> int:
    longest = max(width, height)
    # Round up to a multiple of 32 within the model's comfortable range.
    target = min(1280, max(640, ((longest + 31) // 32) * 32))
    return int(target)


def _build_roof_plane(
    inst,
    req: DetectionRequest,
    ctx: PixelToGeoContext,
    gray: np.ndarray,
    width: int,
    height: int,
) -> Optional[Tuple[RoofPlane, Tuple[int, int, int, int], float]]:
    if inst.confidence < req.roof_confidence_threshold:
        return None

    ring_px = mask_to_polygon(inst.mask, simplify_frac=0.012, snap_tolerance_deg=16.0,
                              min_area_px=float(req.min_roof_area_px))
    if not ring_px or len(ring_px) < 3:
        return None

    area_px = polygon_area_px(ring_px)
    if area_px < req.min_roof_area_px:
        return None

    contours, _ = cv2.findContours(inst.mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        pitch_deg, aspect_deg = _estimate_slope(gray, max(contours, key=cv2.contourArea))
    else:
        pitch_deg, aspect_deg = 12.0, _aspect_from_ring(ring_px)

    ring = [_pixel_to_geo(pt, ctx) for pt in ring_px]
    if len(ring) < 3:
        return None
    ring.append(ring[0])

    plane = RoofPlane(
        id=f"roof_{uuid.uuid4().hex[:8]}",
        confidence=round(float(inst.confidence), 3),
        estimated_pitch_degrees=float(pitch_deg),
        aspect_degrees=float(aspect_deg),
        area_sq_m=round(_area_px_to_sq_m(area_px, req, width, height), 2),
        geometry=PolygonGeometry(coordinates=[ring]),
    )
    ranking = inst.confidence + 0.10 * min(area_px / float(width * height), 1.0)
    return plane, inst.bbox, ranking


def _build_obstacle(
    inst,
    req: DetectionRequest,
    ctx: PixelToGeoContext,
    width: int,
    height: int,
) -> Optional[Obstacle]:
    if inst.confidence < req.obstacle_confidence_threshold:
        return None

    moments = cv2.moments(inst.mask, binaryImage=True)
    if moments["m00"] == 0:
        return None
    cx = moments["m10"] / moments["m00"]
    cy = moments["m01"] / moments["m00"]
    area_px = float(moments["m00"])
    if area_px < req.min_obstacle_area_px:
        return None

    location = _pixel_to_geo((cx, cy), ctx)
    estimated_height = max(0.3, min(4.5, math.sqrt(area_px) / 9.0))
    return Obstacle(
        id=f"obstacle_{uuid.uuid4().hex[:8]}",
        confidence=round(float(inst.confidence), 3),
        obstacle_type=inst.label or "rooftop-obstacle",
        estimated_height_m=round(estimated_height, 2),
        geometry=PointGeometry(coordinates=location),
    )


def _dedupe_and_rank(
    roof_raw: List[Tuple[RoofPlane, Tuple[int, int, int, int], float]],
    max_planes: int,
) -> List[RoofPlane]:
    roof_raw.sort(key=lambda item: item[2], reverse=True)
    selected_bboxes: List[Tuple[int, int, int, int]] = []
    planes: List[RoofPlane] = []
    for plane, bbox, _ in roof_raw:
        if any(_bbox_iou(bbox, existing) > 0.70 for existing in selected_bboxes):
            continue
        selected_bboxes.append(bbox)
        planes.append(plane)
        if len(planes) >= max_planes:
            break
    return planes


def _aspect_from_ring(ring_px) -> float:
    longest = 0.0
    angle = 0.0
    n = len(ring_px)
    for i in range(n):
        x1, y1 = ring_px[i]
        x2, y2 = ring_px[(i + 1) % n]
        length = math.hypot(x2 - x1, y2 - y1)
        if length > longest:
            longest = length
            angle = (math.degrees(math.atan2(-(y2 - y1), x2 - x1)) + 360.0) % 360.0
    return round(angle, 2)


def _append_warnings(
    warning_codes: List[str],
    warnings: List[str],
    roof_candidate_count: int,
    obstacle_candidate_count: int,
    kept_roofs: int,
    kept_obstacles: int,
    req: DetectionRequest,
    image_quality: float,
) -> None:
    if roof_candidate_count > req.max_roof_planes:
        warning_codes.append("TRUNCATED_ROOF_PLANES")
        warnings.append("Roof detections were truncated by max_roof_planes.")
    if obstacle_candidate_count > req.max_obstacles:
        warning_codes.append("TRUNCATED_OBSTACLES")
        warnings.append("Obstacle detections were truncated by max_obstacles.")
    if roof_candidate_count > 0 and kept_roofs == 0:
        warning_codes.append("FILTERED_ROOF_CANDIDATES")
        warnings.append("Roof candidates were detected but filtered by quality thresholds.")
    if obstacle_candidate_count > 0 and kept_obstacles == 0:
        warning_codes.append("FILTERED_OBSTACLE_CANDIDATES")
        warnings.append("Obstacle candidates were detected but filtered by quality thresholds.")
    if kept_roofs == 0:
        warning_codes.append("NO_ROOF_PLANES")
        warnings.append("No high-confidence roof planes found. Try a clearer satellite zoom level.")
    if image_quality < 0.2:
        warning_codes.append("LOW_IMAGE_QUALITY")
        warnings.append("Low image quality detected; roof edges may be incomplete.")
