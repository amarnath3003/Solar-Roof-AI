import base64
import math
import time
import uuid
from dataclasses import dataclass

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


@dataclass
class PixelToGeoContext:
    width: int
    height: int
    west: float
    south: float
    east: float
    north: float


def _decode_image(snapshot_base64: str) -> np.ndarray:
    payload = snapshot_base64
    if "," in payload:
        payload = payload.split(",", 1)[1]

    try:
        raw = base64.b64decode(payload)
    except Exception as exc:
        raise ValueError("Invalid base64 snapshot payload") from exc

    image = cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Unable to decode snapshot image")
    return image


def _pixel_to_geo(point: tuple[float, float], ctx: PixelToGeoContext) -> list[float]:
    x, y = point
    lng = ctx.west + (x / float(ctx.width)) * (ctx.east - ctx.west)
    lat = ctx.north - (y / float(ctx.height)) * (ctx.north - ctx.south)
    return [float(lng), float(lat)]


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


def _area_px_to_sq_m(area_px: float, req: DetectionRequest, width_px: int, height_px: int) -> float:
    width_m = _haversine_m(req.center.lat, req.bounds.west, req.center.lat, req.bounds.east)
    height_m = _haversine_m(req.bounds.south, req.center.lng, req.bounds.north, req.center.lng)
    px_to_m_x = width_m / float(width_px)
    px_to_m_y = height_m / float(height_px)
    return float(max(area_px, 0.0) * px_to_m_x * px_to_m_y)


def _estimate_slope(gray: np.ndarray, contour: np.ndarray) -> tuple[float, float]:
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.drawContours(mask, [contour], -1, 255, thickness=-1)

    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)

    grad_mag = cv2.magnitude(gx, gy)
    grad_angle = cv2.phase(gx, gy, angleInDegrees=True)

    pixels = grad_mag[mask == 255]
    if pixels.size == 0:
        return 10.0, 0.0

    mean_mag = float(np.mean(pixels))
    pitch = max(3.0, min(55.0, mean_mag / 3.4))

    angle_pixels = grad_angle[mask == 255]
    if angle_pixels.size == 0:
        aspect = 0.0
    else:
        sin_sum = float(np.mean(np.sin(np.radians(angle_pixels))))
        cos_sum = float(np.mean(np.cos(np.radians(angle_pixels))))
        aspect = (math.degrees(math.atan2(sin_sum, cos_sum)) + 360.0) % 360.0

    return float(round(pitch, 2)), float(round(aspect, 2))


def _prepare_grayscale(image: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
    return clahe.apply(gray)


def _roof_mask(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    denoised = cv2.bilateralFilter(blurred, 9, 75, 75)
    edges = cv2.Canny(denoised, 60, 165)

    grad_x = cv2.Sobel(denoised, cv2.CV_16S, 1, 0, ksize=3)
    grad_y = cv2.Sobel(denoised, cv2.CV_16S, 0, 1, ksize=3)
    abs_grad_x = cv2.convertScaleAbs(grad_x)
    abs_grad_y = cv2.convertScaleAbs(grad_y)
    gradient = cv2.addWeighted(abs_grad_x, 0.5, abs_grad_y, 0.5, 0)

    # Adaptive threshold highlights rooftop texture transitions before morphology refinement.
    adaptive = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        -2,
    )

    combined = cv2.bitwise_or(edges, adaptive)
    combined = cv2.bitwise_or(combined, gradient)
    _, combined = cv2.threshold(combined, 42, 255, cv2.THRESH_BINARY)

    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel_close, iterations=2)
    opened = cv2.morphologyEx(closed, cv2.MORPH_OPEN, kernel_open, iterations=1)

    return opened, edges


def _obstacle_mask(gray: np.ndarray) -> np.ndarray:
    kernel_large = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    blackhat = cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, kernel_large)
    tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel_large)
    combined = cv2.addWeighted(blackhat, 0.7, tophat, 0.3, 0)

    _, mask = cv2.threshold(combined, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)), iterations=1)

    return mask


def _image_quality_score(gray: np.ndarray) -> float:
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    normalized = max(0.0, min(1.0, laplacian_var / 600.0))

    return round(normalized, 3)


def _contour_touches_border(contour: np.ndarray, width: int, height: int, padding: int = 3) -> bool:
    x, y, w, h = cv2.boundingRect(contour)
    return x <= padding or y <= padding or (x + w) >= (width - padding) or (y + h) >= (height - padding)


def _bbox_iou(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b

    inter_left = max(ax, bx)
    inter_top = max(ay, by)
    inter_right = min(ax + aw, bx + bw)
    inter_bottom = min(ay + ah, by + bh)

    inter_w = max(0, inter_right - inter_left)
    inter_h = max(0, inter_bottom - inter_top)
    inter_area = float(inter_w * inter_h)
    if inter_area <= 0:
        return 0.0

    union_area = float(aw * ah + bw * bh) - inter_area
    if union_area <= 0:
        return 0.0

    return inter_area / union_area


def analyze_snapshot(req: DetectionRequest) -> DetectionResponse:
    started = time.perf_counter()

    image = _decode_image(req.snapshot_base64)
    source_height, source_width = image.shape[:2]

    warning_codes: list[str] = []
    warnings: list[str] = []

    if source_width != req.width or source_height != req.height:
        warning_codes.append("INPUT_DIMENSION_MISMATCH")
        warnings.append("Input width/height differs from decoded snapshot size; decoded dimensions were used.")

    gray = _prepare_grayscale(image)
    roof_candidate_mask, edge_map = _roof_mask(gray)
    obstacle_candidate_mask = _obstacle_mask(gray)

    roof_contours, _ = cv2.findContours(roof_candidate_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    obstacle_contours, _ = cv2.findContours(obstacle_candidate_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    ctx = PixelToGeoContext(
        width=source_width,
        height=source_height,
        west=req.bounds.west,
        south=req.bounds.south,
        east=req.bounds.east,
        north=req.bounds.north,
    )
    image_area = float(source_width * source_height)

    candidate_roof_planes: list[tuple[RoofPlane, tuple[int, int, int, int], float]] = []

    for contour in roof_contours:
        area = cv2.contourArea(contour)
        if area < req.min_roof_area_px:
            continue

        if _contour_touches_border(contour, source_width, source_height) and area > image_area * 0.02:
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue

        approx = cv2.approxPolyDP(contour, req.simplify_epsilon_ratio * perimeter, True)
        if len(approx) < 4:
            continue

        hull = cv2.convexHull(contour)
        hull_area = cv2.contourArea(hull)
        if hull_area <= 0.0:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        if w == 0 or h == 0:
            continue

        aspect_ratio = max(float(w) / float(h), float(h) / float(w))
        if aspect_ratio > 8.0:
            continue

        solidity = float(area / hull_area)
        rectangularity = float(area / float(w * h))
        if solidity < req.min_roof_solidity or rectangularity < req.min_roof_rectangularity:
            continue

        local_edges = edge_map[y : y + h, x : x + w]
        edge_density = float(np.count_nonzero(local_edges)) / float(max(w * h, 1))
        local_roi = gray[y : y + h, x : x + w]
        texture_score = 0.0 if local_roi.size == 0 else float(min(np.std(local_roi) / 70.0, 1.0))

        confidence = max(
            0.0,
            min(
                1.0,
                0.40 * solidity + 0.30 * rectangularity + 0.20 * min(edge_density * 4.5, 1.0) + 0.10 * texture_score,
            ),
        )
        if confidence < req.roof_confidence_threshold:
            continue

        pitch_deg, aspect_deg = _estimate_slope(gray, contour)

        points_px = [(float(p[0][0]), float(p[0][1])) for p in approx]
        ring = [_pixel_to_geo(point, ctx) for point in points_px]
        if len(ring) < 4:
            continue
        ring.append(ring[0])

        candidate_roof_planes.append(
            (
                RoofPlane(
                    id=f"roof_{uuid.uuid4().hex[:8]}",
                    confidence=round(confidence, 3),
                    estimated_pitch_degrees=pitch_deg,
                    aspect_degrees=aspect_deg,
                    area_sq_m=round(_area_px_to_sq_m(area, req, source_width, source_height), 2),
                    geometry=PolygonGeometry(coordinates=[ring]),
                ),
                (x, y, w, h),
                confidence,
            )
        )

    candidate_roof_planes.sort(key=lambda item: item[2], reverse=True)

    roof_planes: list[RoofPlane] = []
    selected_bboxes: list[tuple[int, int, int, int]] = []

    for plane, bbox, _ in candidate_roof_planes:
        is_duplicate = any(_bbox_iou(bbox, existing_bbox) > 0.55 for existing_bbox in selected_bboxes)
        if is_duplicate:
            continue

        selected_bboxes.append(bbox)
        roof_planes.append(plane)
        if len(roof_planes) >= req.max_roof_planes:
            break

    candidate_obstacles: list[tuple[Obstacle, float]] = []

    for contour in obstacle_contours:
        area = cv2.contourArea(contour)
        if area < req.min_obstacle_area_px or area > (req.min_roof_area_px * 0.45):
            continue

        if _contour_touches_border(contour, source_width, source_height):
            continue

        perimeter = cv2.arcLength(contour, True)
        if perimeter <= 0:
            continue
        circularity = float((4.0 * math.pi * area) / max(perimeter * perimeter, 1.0))
        if circularity < 0.08:
            continue

        m = cv2.moments(contour)
        if m["m00"] == 0:
            continue

        c_x = float(m["m10"] / m["m00"])
        c_y = float(m["m01"] / m["m00"])
        location = _pixel_to_geo((c_x, c_y), ctx)

        x, y, w, h = cv2.boundingRect(contour)
        roi = gray[y : y + h, x : x + w]
        contrast = 0.0 if roi.size == 0 else float(np.std(roi) / 80.0)
        confidence = max(0.1, min(1.0, 0.35 + min(contrast, 0.7) * 0.55 + min(circularity, 1.0) * 0.10))
        if confidence < req.obstacle_confidence_threshold:
            continue

        estimated_height = max(0.3, min(4.5, (math.sqrt(area) / 8.0)))

        candidate_obstacles.append(
            (
                Obstacle(
                    id=f"obstacle_{uuid.uuid4().hex[:8]}",
                    confidence=round(confidence, 3),
                    obstacle_type="rooftop-obstacle",
                    estimated_height_m=round(estimated_height, 2),
                    geometry=PointGeometry(coordinates=location),
                ),
                confidence,
            )
        )

    candidate_obstacles.sort(key=lambda item: item[1], reverse=True)
    obstacles = [obstacle for obstacle, _ in candidate_obstacles[: req.max_obstacles]]

    if len(candidate_roof_planes) > req.max_roof_planes:
        warning_codes.append("TRUNCATED_ROOF_PLANES")
        warnings.append("Roof detections were truncated by max_roof_planes.")

    if len(candidate_obstacles) > req.max_obstacles:
        warning_codes.append("TRUNCATED_OBSTACLES")
        warnings.append("Obstacle detections were truncated by max_obstacles.")

    if roof_contours and not candidate_roof_planes:
        warning_codes.append("FILTERED_ROOF_CANDIDATES")
        warnings.append("Roof candidates were detected but filtered by quality thresholds.")

    if obstacle_contours and not obstacles:
        warning_codes.append("FILTERED_OBSTACLE_CANDIDATES")
        warnings.append("Obstacle candidates were detected but filtered by quality thresholds.")

    if not roof_planes:
        warning_codes.append("NO_ROOF_PLANES")
        warnings.append("No high-confidence roof planes found. Try a clearer satellite zoom level.")

    image_quality = _image_quality_score(gray)
    if image_quality < 0.2:
        warning_codes.append("LOW_IMAGE_QUALITY")
        warnings.append("Low image quality detected; roof edges may be incomplete.")

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    metadata = DetectionMetadata(
        processing_ms=elapsed_ms,
        roof_candidates=len(roof_contours),
        obstacle_candidates=len(obstacle_contours),
        filtered_roof_planes=len(roof_planes),
        filtered_obstacles=len(obstacles),
        model="opencv-edge-segmentation-v2",
        image_quality=image_quality,
        input_width=source_width,
        input_height=source_height,
        warning_codes=warning_codes,
        warnings=warnings,
        estimated_metrics=["estimated_pitch_degrees", "aspect_degrees", "estimated_height_m"],
    )

    return DetectionResponse(roof_planes=roof_planes, obstacles=obstacles, metadata=metadata)
