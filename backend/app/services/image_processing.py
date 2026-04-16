import base64
import math
import os
import re
import tempfile
import time
import uuid
from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree

import cv2
import numpy as np

try:
    from inference_sdk import InferenceHTTPClient
except Exception:  # pragma: no cover - optional dependency in local dev before install
    InferenceHTTPClient = None  # type: ignore[assignment]

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


@dataclass
class RoofCandidate:
    plane: RoofPlane
    bbox: tuple[int, int, int, int]
    score: float
    contour: np.ndarray
    centroid: tuple[float, float]


@dataclass
class RoboflowSettings:
    api_url: str
    api_key: str
    workspace_name: str
    workflow_id: str
    use_cache: bool


@dataclass
class SvgShapeCandidate:
    points: list[tuple[float, float]]
    area_px: float
    centroid: tuple[float, float] | None
    bbox: tuple[int, int, int, int]
    confidence: float | None
    label: str


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


def _parse_env_bool(env_var: str, default: bool) -> bool:
    raw_value = os.getenv(env_var)
    if raw_value is None:
        return default

    return raw_value.strip().lower() not in {"0", "false", "no", "off"}


def _load_roboflow_settings() -> RoboflowSettings | None:
    api_key = os.getenv("ROBOFLOW_API_KEY")
    if not api_key:
        return None

    return RoboflowSettings(
        api_url=os.getenv("ROBOFLOW_API_URL", "https://serverless.roboflow.com"),
        api_key=api_key,
        workspace_name=os.getenv("ROBOFLOW_WORKSPACE", "rooflayout"),
        workflow_id=os.getenv("ROBOFLOW_WORKFLOW_ID", "detect-count-and-visualize"),
        use_cache=_parse_env_bool("ROBOFLOW_USE_CACHE", default=True),
    )


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


def _contour_centroid(contour: np.ndarray) -> tuple[float, float] | None:
    moments = cv2.moments(contour)
    if moments["m00"] == 0:
        return None

    return float(moments["m10"] / moments["m00"]), float(moments["m01"] / moments["m00"])


def _center_prior(centroid: tuple[float, float], width: int, height: int) -> float:
    cx = width / 2.0
    cy = height / 2.0
    dist = math.hypot(centroid[0] - cx, centroid[1] - cy)
    norm_dist = dist / max(math.hypot(width, height), 1.0)
    sigma = 0.22
    return float(math.exp(-((norm_dist * norm_dist) / (2.0 * sigma * sigma))))


def _parse_optional_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _polygon_area(points: list[tuple[float, float]]) -> float:
    if len(points) < 3:
        return 0.0

    area = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        area += (x1 * y2) - (x2 * y1)

    return abs(area) / 2.0


def _polygon_centroid(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    if len(points) < 3:
        return None

    area_factor = 0.0
    centroid_x = 0.0
    centroid_y = 0.0

    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        cross = (x1 * y2) - (x2 * y1)
        area_factor += cross
        centroid_x += (x1 + x2) * cross
        centroid_y += (y1 + y2) * cross

    if abs(area_factor) < 1e-9:
        return None

    area_factor *= 0.5
    centroid_x /= 6.0 * area_factor
    centroid_y /= 6.0 * area_factor
    return float(centroid_x), float(centroid_y)


def _bbox_from_points(points: list[tuple[float, float]]) -> tuple[int, int, int, int]:
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    min_x = int(math.floor(min(xs)))
    min_y = int(math.floor(min(ys)))
    max_x = int(math.ceil(max(xs)))
    max_y = int(math.ceil(max(ys)))
    return min_x, min_y, max(0, max_x - min_x), max(0, max_y - min_y)


def _estimate_aspect_from_points(points: list[tuple[float, float]]) -> float:
    if len(points) < 2:
        return 0.0

    longest_segment = 0.0
    segment_angle = 0.0
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[(index + 1) % len(points)]
        length = math.hypot(x2 - x1, y2 - y1)
        if length <= longest_segment:
            continue

        longest_segment = length
        # Convert image-space angle to a compass-like heading in [0, 360).
        segment_angle = (math.degrees(math.atan2(-(y2 - y1), x2 - x1)) + 360.0) % 360.0

    return float(round(segment_angle, 2))


def _parse_svg_points(value: str) -> list[tuple[float, float]]:
    numbers = re.findall(r"[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?", value)
    if len(numbers) < 6:
        return []

    points: list[tuple[float, float]] = []
    for index in range(0, len(numbers) - 1, 2):
        points.append((float(numbers[index]), float(numbers[index + 1])))

    return points


def _svg_local_tag_name(tag_name: str) -> str:
    if "}" in tag_name:
        return tag_name.split("}", 1)[1].lower()
    return tag_name.lower()


def _extract_svg_markup(result: Any) -> str | None:
    if isinstance(result, str):
        return result if "<svg" in result.lower() else None

    if isinstance(result, dict):
        for key in ("svg", "output_svg", "visualization_svg", "result_svg"):
            candidate = result.get(key)
            if isinstance(candidate, str) and "<svg" in candidate.lower():
                return candidate

        for value in result.values():
            found = _extract_svg_markup(value)
            if found is not None:
                return found
        return None

    if isinstance(result, list):
        for item in result:
            found = _extract_svg_markup(item)
            if found is not None:
                return found

    return None


def _parse_svg_shape_candidates(svg_markup: str) -> list[SvgShapeCandidate]:
    try:
        root = ElementTree.fromstring(svg_markup)
    except ElementTree.ParseError as exc:
        raise ValueError("Roboflow workflow returned invalid SVG output") from exc

    candidates: list[SvgShapeCandidate] = []

    for element in root.iter():
        tag_name = _svg_local_tag_name(element.tag)
        points: list[tuple[float, float]] = []

        if tag_name in {"polygon", "polyline"}:
            points = _parse_svg_points(element.attrib.get("points", ""))
        elif tag_name == "rect":
            x = _parse_optional_float(element.attrib.get("x")) or 0.0
            y = _parse_optional_float(element.attrib.get("y")) or 0.0
            width = _parse_optional_float(element.attrib.get("width")) or 0.0
            height = _parse_optional_float(element.attrib.get("height")) or 0.0
            if width > 0.0 and height > 0.0:
                points = [
                    (x, y),
                    (x + width, y),
                    (x + width, y + height),
                    (x, y + height),
                ]
        elif tag_name == "path":
            path_data = element.attrib.get("d", "")
            points = _parse_svg_points(path_data)

        if len(points) < 3:
            continue

        area_px = _polygon_area(points)
        if area_px <= 0.0:
            continue

        bbox = _bbox_from_points(points)
        if bbox[2] <= 0 or bbox[3] <= 0:
            continue

        label_parts = [
            element.attrib.get("class", ""),
            element.attrib.get("id", ""),
            element.attrib.get("label", ""),
            element.attrib.get("data-label", ""),
            element.attrib.get("name", ""),
        ]
        label = " ".join(part for part in label_parts if part).strip().lower()

        confidence = None
        for attribute_key in ("confidence", "score", "probability", "data-confidence", "data-score"):
            confidence = _parse_optional_float(element.attrib.get(attribute_key))
            if confidence is not None:
                break

        candidates.append(
            SvgShapeCandidate(
                points=points,
                area_px=area_px,
                centroid=_polygon_centroid(points),
                bbox=bbox,
                confidence=confidence,
                label=label,
            )
        )

    return candidates


def _run_roboflow_workflow(image: np.ndarray, settings: RoboflowSettings) -> Any:
    if InferenceHTTPClient is None:
        raise RuntimeError("inference-sdk is not installed")

    temp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
            temp_path = temp_file.name

        if not cv2.imwrite(temp_path, image):
            raise RuntimeError("Unable to persist snapshot to a temporary file")

        client = InferenceHTTPClient(api_url=settings.api_url, api_key=settings.api_key)
        return client.run_workflow(
            workspace_name=settings.workspace_name,
            workflow_id=settings.workflow_id,
            images={"image": temp_path},
            use_cache=settings.use_cache,
        )
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


def _analyze_snapshot_roboflow(
    req: DetectionRequest,
    image: np.ndarray,
    source_width: int,
    source_height: int,
    started: float,
    warning_codes: list[str],
    warnings: list[str],
    settings: RoboflowSettings,
) -> DetectionResponse:
    gray = _prepare_grayscale(image)
    image_quality = _image_quality_score(gray)

    workflow_result = _run_roboflow_workflow(image, settings)
    svg_markup = _extract_svg_markup(workflow_result)
    if not svg_markup:
        raise ValueError("Roboflow workflow response does not contain an SVG payload")

    shape_candidates = _parse_svg_shape_candidates(svg_markup)
    ctx = PixelToGeoContext(
        width=source_width,
        height=source_height,
        west=req.bounds.west,
        south=req.bounds.south,
        east=req.bounds.east,
        north=req.bounds.north,
    )
    image_area = float(source_width * source_height)

    roof_raw: list[tuple[RoofPlane, tuple[int, int, int, int], float, tuple[float, float]]] = []
    obstacle_raw: list[tuple[Obstacle, float]] = []
    roof_candidate_count = 0
    obstacle_candidate_count = 0

    for candidate in shape_candidates:
        label = candidate.label
        is_obstacle_labeled = any(keyword in label for keyword in ("obstacle", "chimney", "vent", "hvac"))
        is_roof_labeled = any(keyword in label for keyword in ("roof", "plane", "surface"))

        inferred_as_obstacle = is_obstacle_labeled or (
            not is_roof_labeled and candidate.area_px <= (req.min_roof_area_px * 0.40)
        )

        if inferred_as_obstacle:
            obstacle_candidate_count += 1
            centroid = candidate.centroid
            if centroid is None:
                continue

            if candidate.area_px < req.min_obstacle_area_px:
                continue

            if candidate.area_px > (req.min_roof_area_px * 0.55):
                continue

            center_prior = _center_prior(centroid, source_width, source_height)
            confidence_seed = candidate.confidence if candidate.confidence is not None else 0.62
            confidence = max(0.0, min(1.0, (confidence_seed * 0.7) + (center_prior * 0.3)))
            if confidence < req.obstacle_confidence_threshold:
                continue

            location = _pixel_to_geo(centroid, ctx)
            estimated_height = max(0.3, min(4.5, (math.sqrt(candidate.area_px) / 9.0)))
            obstacle_raw.append(
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
            continue

        roof_candidate_count += 1
        if candidate.area_px < req.min_roof_area_px:
            continue

        centroid = candidate.centroid
        if centroid is None:
            continue

        center_prior = _center_prior(centroid, source_width, source_height)
        if center_prior < 0.08:
            continue

        bbox = candidate.bbox
        if bbox[2] <= 0 or bbox[3] <= 0:
            continue

        aspect_ratio = max(float(bbox[2]) / float(max(bbox[3], 1)), float(bbox[3]) / float(max(bbox[2], 1)))
        if aspect_ratio > 10.0:
            continue

        confidence_seed = candidate.confidence if candidate.confidence is not None else 0.78
        confidence = max(0.0, min(1.0, (confidence_seed * 0.72) + (center_prior * 0.28)))
        if confidence < req.roof_confidence_threshold:
            continue

        ring = [_pixel_to_geo(point, ctx) for point in candidate.points]
        if len(ring) < 4:
            continue
        ring.append(ring[0])

        pitch_degrees = float(round(8.0 + ((1.0 - center_prior) * 10.0), 2))
        aspect_degrees = _estimate_aspect_from_points(candidate.points)
        ranking_score = confidence + (0.22 * center_prior) + (0.10 * min(candidate.area_px / max(image_area, 1.0), 1.0))

        roof_raw.append(
            (
                RoofPlane(
                    id=f"roof_{uuid.uuid4().hex[:8]}",
                    confidence=round(confidence, 3),
                    estimated_pitch_degrees=pitch_degrees,
                    aspect_degrees=aspect_degrees,
                    area_sq_m=round(_area_px_to_sq_m(candidate.area_px, req, source_width, source_height), 2),
                    geometry=PolygonGeometry(coordinates=[ring]),
                ),
                bbox,
                ranking_score,
                centroid,
            )
        )

    roof_raw.sort(key=lambda item: item[2], reverse=True)
    selected_bboxes: list[tuple[int, int, int, int]] = []
    roof_planes: list[RoofPlane] = []
    for plane, bbox, _, _ in roof_raw:
        is_duplicate = any(_bbox_iou(bbox, existing_bbox) > 0.60 for existing_bbox in selected_bboxes)
        if is_duplicate:
            continue

        selected_bboxes.append(bbox)
        roof_planes.append(plane)
        if len(roof_planes) >= req.max_roof_planes:
            break

    obstacle_raw.sort(key=lambda item: item[1], reverse=True)
    obstacles = [obstacle for obstacle, _ in obstacle_raw[: req.max_obstacles]]

    if roof_candidate_count > req.max_roof_planes:
        warning_codes.append("TRUNCATED_ROOF_PLANES")
        warnings.append("Roof detections were truncated by max_roof_planes.")

    if obstacle_candidate_count > req.max_obstacles:
        warning_codes.append("TRUNCATED_OBSTACLES")
        warnings.append("Obstacle detections were truncated by max_obstacles.")

    if roof_candidate_count > 0 and not roof_planes:
        warning_codes.append("FILTERED_ROOF_CANDIDATES")
        warnings.append("Roof candidates were detected but filtered by quality thresholds.")

    if obstacle_candidate_count > 0 and not obstacles:
        warning_codes.append("FILTERED_OBSTACLE_CANDIDATES")
        warnings.append("Obstacle candidates were detected but filtered by quality thresholds.")

    if not roof_planes:
        warning_codes.append("NO_ROOF_PLANES")
        warnings.append("No high-confidence roof planes found. Try a clearer satellite zoom level.")

    if image_quality < 0.2:
        warning_codes.append("LOW_IMAGE_QUALITY")
        warnings.append("Low image quality detected; roof edges may be incomplete.")

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    metadata = DetectionMetadata(
        processing_ms=elapsed_ms,
        roof_candidates=roof_candidate_count,
        obstacle_candidates=obstacle_candidate_count,
        filtered_roof_planes=len(roof_planes),
        filtered_obstacles=len(obstacles),
        model=f"roboflow-workflow:{settings.workspace_name}/{settings.workflow_id}",
        image_quality=image_quality,
        input_width=source_width,
        input_height=source_height,
        warning_codes=warning_codes,
        warnings=warnings,
        estimated_metrics=["estimated_pitch_degrees", "aspect_degrees", "estimated_height_m"],
    )

    return DetectionResponse(roof_planes=roof_planes, obstacles=obstacles, metadata=metadata)


def _analyze_snapshot_opencv(
    req: DetectionRequest,
    image: np.ndarray,
    source_width: int,
    source_height: int,
    started: float,
    warning_codes: list[str],
    warnings: list[str],
) -> DetectionResponse:
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

    candidate_roof_planes: list[RoofCandidate] = []

    for contour in roof_contours:
        area = cv2.contourArea(contour)
        if area < req.min_roof_area_px:
            continue

        centroid = _contour_centroid(contour)
        if centroid is None:
            continue

        center_prior = _center_prior(centroid, source_width, source_height)
        if center_prior < 0.12:
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
                0.32 * solidity
                + 0.24 * rectangularity
                + 0.18 * min(edge_density * 4.5, 1.0)
                + 0.08 * texture_score
                + 0.18 * center_prior,
            ),
        )
        if confidence < req.roof_confidence_threshold:
            continue

        ranking_score = confidence + (0.28 * center_prior)

        pitch_deg, aspect_deg = _estimate_slope(gray, contour)

        points_px = [(float(p[0][0]), float(p[0][1])) for p in approx]
        ring = [_pixel_to_geo(point, ctx) for point in points_px]
        if len(ring) < 4:
            continue
        ring.append(ring[0])

        candidate_roof_planes.append(
            RoofCandidate(
                plane=RoofPlane(
                    id=f"roof_{uuid.uuid4().hex[:8]}",
                    confidence=round(confidence, 3),
                    estimated_pitch_degrees=pitch_deg,
                    aspect_degrees=aspect_deg,
                    area_sq_m=round(_area_px_to_sq_m(area, req, source_width, source_height), 2),
                    geometry=PolygonGeometry(coordinates=[ring]),
                ),
                bbox=(x, y, w, h),
                score=ranking_score,
                contour=contour,
                centroid=centroid,
            )
        )

    candidate_roof_planes.sort(key=lambda item: item.score, reverse=True)

    roof_planes: list[RoofPlane] = []
    selected_bboxes: list[tuple[int, int, int, int]] = []
    selected_contours: list[np.ndarray] = []
    primary_bbox: tuple[int, int, int, int] | None = None
    primary_centroid: tuple[float, float] | None = None

    for candidate in candidate_roof_planes:
        plane = candidate.plane
        bbox = candidate.bbox
        is_duplicate = any(_bbox_iou(bbox, existing_bbox) > 0.55 for existing_bbox in selected_bboxes)
        if is_duplicate:
            continue

        if primary_bbox is not None and primary_centroid is not None:
            proximity_iou = _bbox_iou(bbox, primary_bbox)
            centroid_distance = math.hypot(candidate.centroid[0] - primary_centroid[0], candidate.centroid[1] - primary_centroid[1])
            if proximity_iou < 0.02 and centroid_distance > (max(source_width, source_height) * 0.24):
                continue

        selected_bboxes.append(bbox)
        roof_planes.append(plane)
        selected_contours.append(candidate.contour)
        if primary_bbox is None:
            primary_bbox = bbox
            primary_centroid = candidate.centroid

        if len(roof_planes) >= req.max_roof_planes:
            break

    candidate_obstacles: list[tuple[Obstacle, float]] = []
    roof_focus_mask = np.zeros(gray.shape, dtype=np.uint8)
    if selected_contours:
        cv2.drawContours(roof_focus_mask, selected_contours, -1, 255, thickness=-1)
        roof_focus_mask = cv2.dilate(
            roof_focus_mask,
            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (19, 19)),
            iterations=1,
        )

    for contour in obstacle_contours:
        area = cv2.contourArea(contour)
        if area < req.min_obstacle_area_px or area > (req.min_roof_area_px * 0.30):
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

        if selected_contours:
            px = int(round(c_x))
            py = int(round(c_y))
            px = max(0, min(source_width - 1, px))
            py = max(0, min(source_height - 1, py))
            if roof_focus_mask[py, px] == 0:
                continue

        location = _pixel_to_geo((c_x, c_y), ctx)

        x, y, w, h = cv2.boundingRect(contour)
        roi = gray[y : y + h, x : x + w]
        contrast = 0.0 if roi.size == 0 else float(np.std(roi) / 80.0)
        confidence = max(0.1, min(1.0, 0.25 + min(contrast, 0.7) * 0.50 + min(circularity, 1.0) * 0.15))
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
        model="opencv-edge-segmentation-v3-center-prior",
        image_quality=image_quality,
        input_width=source_width,
        input_height=source_height,
        warning_codes=warning_codes,
        warnings=warnings,
        estimated_metrics=["estimated_pitch_degrees", "aspect_degrees", "estimated_height_m"],
    )

    return DetectionResponse(roof_planes=roof_planes, obstacles=obstacles, metadata=metadata)


def analyze_snapshot(req: DetectionRequest) -> DetectionResponse:
    started = time.perf_counter()

    image = _decode_image(req.snapshot_base64)
    source_height, source_width = image.shape[:2]

    warning_codes: list[str] = []
    warnings: list[str] = []

    if source_width != req.width or source_height != req.height:
        warning_codes.append("INPUT_DIMENSION_MISMATCH")
        warnings.append("Input width/height differs from decoded snapshot size; decoded dimensions were used.")

    roboflow_settings = _load_roboflow_settings()
    if roboflow_settings is not None:
        try:
            return _analyze_snapshot_roboflow(
                req=req,
                image=image,
                source_width=source_width,
                source_height=source_height,
                started=started,
                warning_codes=warning_codes,
                warnings=warnings,
                settings=roboflow_settings,
            )
        except Exception:
            warning_codes.append("ROBOFLOW_FALLBACK")
            warnings.append("Roboflow workflow failed; fallback OpenCV pipeline was used.")

    return _analyze_snapshot_opencv(
        req=req,
        image=image,
        source_width=source_width,
        source_height=source_height,
        started=started,
        warning_codes=warning_codes,
        warnings=warnings,
    )
