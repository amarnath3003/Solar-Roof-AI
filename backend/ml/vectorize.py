"""Turn a raster instance mask into a clean, vector-like straight-line polygon.

The whole point of the new backend is that outlines look *drawn*, not traced:
few vertices, straight edges, square corners where the building is rectilinear.
Pipeline per mask:

    mask -> largest contour -> Douglas-Peucker -> dominant-orientation estimate
         -> per-edge direction snapping (0/45/90 relative to building axis)
         -> reconstruct corners as intersections of the snapped edge-lines
         -> shapely validity cleanup

`regularize_polygon` also works on an already-extracted point ring, so the same
straightening is reused for polygons coming from any source.
"""

from __future__ import annotations

import math
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np

Point = Tuple[float, float]

# Angles (relative to the building's dominant axis) that edges are allowed to
# snap to. 0/90 => rectilinear walls, 45/135 => hip-roof diagonals.
_SNAP_TARGETS_DEG = (0.0, 45.0, 90.0, 135.0)


def mask_to_polygon(
    mask: np.ndarray,
    *,
    simplify_frac: float = 0.012,
    snap_tolerance_deg: float = 16.0,
    min_area_px: float = 1.0,
    orthogonalize: bool = True,
) -> Optional[List[Point]]:
    """Extract the dominant outline of ``mask`` as a straightened point ring.

    Returns an open ring (first point != last) of (x, y) pixel coordinates, or
    ``None`` if the mask has no usable contour.
    """

    if mask is None or mask.size == 0:
        return None

    binary = (mask > 0).astype(np.uint8)
    if int(binary.sum()) < max(1, int(min_area_px)):
        return None

    # Close 1px gaps so thin roof ridges do not split the contour.
    binary = cv2.morphologyEx(
        binary, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    )

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    contour = max(contours, key=cv2.contourArea)
    if cv2.contourArea(contour) < max(1.0, min_area_px):
        return None

    perimeter = cv2.arcLength(contour, True)
    if perimeter <= 0:
        return None

    epsilon = max(1.0, simplify_frac * perimeter)
    approx = cv2.approxPolyDP(contour, epsilon, True)
    ring = [(float(p[0][0]), float(p[0][1])) for p in approx]
    ring = _dedupe(ring)
    if len(ring) < 3:
        return None

    if orthogonalize:
        regularized = regularize_polygon(ring, snap_tolerance_deg=snap_tolerance_deg)
        if regularized is not None and len(regularized) >= 3:
            ring = regularized

    ring = _shapely_clean(ring)
    if ring is None or len(ring) < 3:
        return None

    return ring


def regularize_polygon(
    ring: Sequence[Point],
    *,
    snap_tolerance_deg: float = 16.0,
) -> Optional[List[Point]]:
    """Straighten an open point ring by snapping edges to the building axis.

    Each edge keeps its midpoint but adopts a snapped direction; consecutive
    edges are then re-intersected so corners stay crisp instead of drifting.
    """

    pts = _dedupe(list(ring))
    n = len(pts)
    if n < 3:
        return None

    edges = []  # (midpoint, direction_unit_vector, length)
    for i in range(n):
        a = pts[i]
        b = pts[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        if length < 1e-6:
            continue
        mid = ((a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0)
        edges.append([mid, (dx / length, dy / length), length])

    if len(edges) < 3:
        return None

    axis = _dominant_axis(edges)

    snapped_dirs: List[Tuple[float, float]] = []
    for _, (ux, uy), _ in edges:
        angle = math.degrees(math.atan2(uy, ux))
        rel = _norm180(angle - axis)
        target = _nearest_snap(rel, snap_tolerance_deg)
        if target is None:
            snapped_dirs.append((ux, uy))  # keep original direction
        else:
            theta = math.radians(axis + target)
            snapped_dirs.append((math.cos(theta), math.sin(theta)))

    # Rebuild vertices as intersections of consecutive snapped edge-lines.
    m = len(edges)
    new_pts: List[Point] = []
    for i in range(m):
        p0, d0 = edges[i][0], snapped_dirs[i]
        p1, d1 = edges[(i + 1) % m][0], snapped_dirs[(i + 1) % m]
        inter = _line_intersection(p0, d0, p1, d1)
        if inter is None:
            # Parallel / degenerate: fall back to the shared original vertex.
            inter = pts[(i + 1) % n] if (i + 1) < n else pts[0]
        new_pts.append(inter)

    new_pts = _dedupe(new_pts)
    if len(new_pts) < 3:
        return None
    return new_pts


def _dominant_axis(edges: Sequence[Sequence]) -> float:
    """Length-weighted dominant orientation in degrees, folded into [0, 90)."""

    sin_acc = 0.0
    cos_acc = 0.0
    for _, (ux, uy), length in edges:
        angle = math.atan2(uy, ux)
        # Fold to [0, 90): rectilinear buildings have edges 90 deg apart, and
        # opposite edges are anti-parallel, so multiply angle by 4 on the circle.
        sin_acc += length * math.sin(4.0 * angle)
        cos_acc += length * math.cos(4.0 * angle)

    if abs(sin_acc) < 1e-9 and abs(cos_acc) < 1e-9:
        return 0.0
    axis = math.degrees(math.atan2(sin_acc, cos_acc)) / 4.0
    return axis % 90.0


def _nearest_snap(rel_angle: float, tol: float) -> Optional[float]:
    best = None
    best_diff = tol
    for target in _SNAP_TARGETS_DEG:
        diff = abs(_norm180(rel_angle - target))
        if diff <= best_diff:
            best_diff = diff
            best = target
    return best


def _line_intersection(p0: Point, d0: Point, p1: Point, d1: Point) -> Optional[Point]:
    """Intersection of line (p0 + t*d0) and (p1 + s*d1)."""

    denom = d0[0] * (-d1[1]) - d0[1] * (-d1[0])
    if abs(denom) < 1e-9:
        return None
    rhs_x = p1[0] - p0[0]
    rhs_y = p1[1] - p0[1]
    t = (rhs_x * (-d1[1]) - rhs_y * (-d1[0])) / denom
    return (p0[0] + t * d0[0], p0[1] + t * d0[1])


def _norm180(angle: float) -> float:
    """Fold an angle difference into (-90, 90] for axis comparisons."""

    a = (angle + 90.0) % 180.0 - 90.0
    return a


def _dedupe(pts: Sequence[Point], tol: float = 0.75) -> List[Point]:
    out: List[Point] = []
    for p in pts:
        if not out or math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) > tol:
            out.append((float(p[0]), float(p[1])))
    # Drop a trailing point that closes the ring back onto the first.
    if len(out) >= 2 and math.hypot(out[0][0] - out[-1][0], out[0][1] - out[-1][1]) <= tol:
        out.pop()
    return out


def _shapely_clean(ring: List[Point]) -> Optional[List[Point]]:
    """Best-effort validity fix; degrades gracefully if shapely is absent."""

    try:
        from shapely.geometry import Polygon
        from shapely.validation import make_valid
    except Exception:
        return ring

    try:
        poly = Polygon(ring)
        if not poly.is_valid:
            poly = make_valid(poly)
        if poly.geom_type == "MultiPolygon":
            poly = max(poly.geoms, key=lambda g: g.area)
        if poly.geom_type != "Polygon" or poly.is_empty:
            return ring
        coords = list(poly.exterior.coords)
        if len(coords) >= 2 and coords[0] == coords[-1]:
            coords = coords[:-1]
        cleaned = _dedupe([(float(x), float(y)) for x, y in coords])
        return cleaned if len(cleaned) >= 3 else ring
    except Exception:
        return ring


def polygon_area_px(ring: Sequence[Point]) -> float:
    """Shoelace area of an (open) point ring."""

    n = len(ring)
    if n < 3:
        return 0.0
    acc = 0.0
    for i in range(n):
        x1, y1 = ring[i]
        x2, y2 = ring[(i + 1) % n]
        acc += x1 * y2 - x2 * y1
    return abs(acc) / 2.0
