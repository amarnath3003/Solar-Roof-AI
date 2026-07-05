"""Unit tests for the mask -> straight-line polygon vectorizer."""

import math

import cv2
import numpy as np
import pytest

from ml.vectorize import mask_to_polygon, polygon_area_px, regularize_polygon


def _rect_mask(width=200, height=200, rect=((40, 60), (160, 140)), angle=0.0):
    """Binary mask containing one (optionally rotated) filled rectangle."""

    mask = np.zeros((height, width), dtype=np.uint8)
    (x0, y0), (x1, y1) = rect
    if angle == 0.0:
        cv2.rectangle(mask, (x0, y0), (x1, y1), 255, thickness=-1)
        return mask

    center = ((x0 + x1) / 2.0, (y0 + y1) / 2.0)
    size = (float(x1 - x0), float(y1 - y0))
    box = cv2.boxPoints((center, size, angle)).astype(np.int32)
    cv2.fillPoly(mask, [box], 255)
    return mask


def _l_shape_mask(width=220, height=220):
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.rectangle(mask, (40, 40), (180, 100), 255, thickness=-1)
    cv2.rectangle(mask, (40, 40), (100, 180), 255, thickness=-1)
    return mask


class TestMaskToPolygon:
    def test_empty_mask_returns_none(self):
        assert mask_to_polygon(np.zeros((100, 100), dtype=np.uint8)) is None

    def test_none_like_mask_returns_none(self):
        assert mask_to_polygon(np.zeros((0, 0), dtype=np.uint8)) is None

    def test_below_min_area_returns_none(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[50, 50] = 255
        assert mask_to_polygon(mask, min_area_px=100.0) is None

    def test_axis_aligned_rect_gives_four_vertices(self):
        ring = mask_to_polygon(_rect_mask())
        assert ring is not None
        assert len(ring) == 4

    def test_rotated_rect_gives_four_vertices(self):
        ring = mask_to_polygon(_rect_mask(angle=27.0))
        assert ring is not None
        assert len(ring) == 4

    def test_l_shape_gives_six_vertices(self):
        ring = mask_to_polygon(_l_shape_mask())
        assert ring is not None
        assert len(ring) == 6

    def test_rect_area_close_to_mask_area(self):
        mask = _rect_mask()
        ring = mask_to_polygon(mask)
        assert ring is not None
        mask_area = float((mask > 0).sum())
        poly_area = polygon_area_px(ring)
        assert poly_area == pytest.approx(mask_area, rel=0.06)

    def test_rotated_rect_edges_snap_to_common_axis(self):
        ring = mask_to_polygon(_rect_mask(angle=30.0))
        assert ring is not None
        angles = []
        for i in range(len(ring)):
            x1, y1 = ring[i]
            x2, y2 = ring[(i + 1) % len(ring)]
            angles.append(math.degrees(math.atan2(y2 - y1, x2 - x1)) % 90.0)
        # All edges should share one orientation modulo 90 deg (rectilinear).
        spread = max(angles) - min(angles)
        assert spread < 2.0 or spread > 88.0  # wraparound at the 0/90 seam


class TestRegularizePolygon:
    def test_too_few_points_returns_none(self):
        assert regularize_polygon([(0, 0), (10, 0)]) is None

    def test_duplicate_points_collapse_to_none(self):
        assert regularize_polygon([(0, 0), (0.1, 0.1), (0.2, 0.2)]) is None

    def test_noisy_rectangle_straightens_to_four_corners(self):
        # Rectangle with slightly jittered corners.
        ring = [(0.0, 1.5), (100.0, -1.0), (101.0, 50.5), (-0.5, 51.0)]
        out = regularize_polygon(ring)
        assert out is not None
        assert len(out) == 4


class TestPolygonAreaPx:
    def test_unit_square(self):
        assert polygon_area_px([(0, 0), (1, 0), (1, 1), (0, 1)]) == pytest.approx(1.0)

    def test_degenerate_returns_zero(self):
        assert polygon_area_px([(0, 0), (1, 1)]) == 0.0

    def test_winding_direction_irrelevant(self):
        cw = [(0, 0), (0, 2), (2, 2), (2, 0)]
        ccw = list(reversed(cw))
        assert polygon_area_px(cw) == polygon_area_px(ccw) == pytest.approx(4.0)
