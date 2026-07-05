import { describe, expect, it } from "vitest";
import {
  PANEL_TYPES,
  buildPanelLayoutContext,
  createPanelFeatureAtCenter,
  validatePanelPlacement,
} from "./panelLayout";
import type { ObstacleMarker, RoofElement } from "@/types";

// Roughly 44m x 44m square roof at the equator ([lng, lat] ring).
const ROOF_SIZE_DEG = 0.0004;

function makeRoofElement(id: number, sizeDeg = ROOF_SIZE_DEG): RoofElement {
  return {
    id,
    layerId: id,
    type: "polygon",
    geoJSON: {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [sizeDeg, 0],
            [sizeDeg, sizeDeg],
            [0, sizeDeg],
            [0, 0],
          ],
        ],
      },
    },
    style: { color: "#fff" },
    source: "manual",
  };
}

function makeObstacle(id: number, lat: number, lng: number): ObstacleMarker {
  return {
    id,
    layerId: id,
    type: "obstacle",
    position: [lat, lng],
    label: "Obstacle",
    source: "manual",
  };
}

describe("buildPanelLayoutContext", () => {
  it("returns no primary roof for empty input", () => {
    const context = buildPanelLayoutContext([], []);
    expect(context.primaryRoof).toBeNull();
  });

  it("selects the largest polygon as the primary roof", () => {
    const small = makeRoofElement(1, ROOF_SIZE_DEG / 4);
    const large = makeRoofElement(2, ROOF_SIZE_DEG);
    const context = buildPanelLayoutContext([small, large], []);

    expect(context.primaryRoof).not.toBeNull();
    const ring = (context.primaryRoof!.geometry as GeoJSON.Polygon).coordinates[0];
    expect(Math.max(...ring.map(([lng]) => lng))).toBeCloseTo(ROOF_SIZE_DEG, 10);
  });
});

describe("validatePanelPlacement", () => {
  const roofCenter = { lat: ROOF_SIZE_DEG / 2, lng: ROOF_SIZE_DEG / 2 };

  it("fails with missing-roof when no primary roof exists", () => {
    const context = buildPanelLayoutContext([], []);
    const panel = createPanelFeatureAtCenter(roofCenter, "standard-residential");
    const validation = validatePanelPlacement(panel, context);

    expect(validation.isValid).toBe(false);
    expect(validation.failures).toContain("missing-roof");
  });

  it("accepts a panel centered inside the roof", () => {
    const context = buildPanelLayoutContext([makeRoofElement(1)], []);
    const panel = createPanelFeatureAtCenter(roofCenter, "standard-residential");
    const validation = validatePanelPlacement(panel, context);

    expect(validation.failures).toEqual([]);
    expect(validation.isValid).toBe(true);
  });

  it("rejects a panel placed outside the roof", () => {
    const context = buildPanelLayoutContext([makeRoofElement(1)], []);
    const panel = createPanelFeatureAtCenter({ lat: 1, lng: 1 }, "standard-residential");
    const validation = validatePanelPlacement(panel, context);

    expect(validation.isValid).toBe(false);
    expect(validation.failures).toContain("outside-roof");
  });

  it("rejects overlapping panels", () => {
    const context = buildPanelLayoutContext([makeRoofElement(1)], []);
    const first = createPanelFeatureAtCenter(roofCenter, "standard-residential");
    const second = createPanelFeatureAtCenter(roofCenter, "standard-residential");
    const validation = validatePanelPlacement(second, context, [first]);

    expect(validation.isValid).toBe(false);
    expect(validation.failures).toContain("intersects-panel");
  });

  it("rejects a panel overlapping an obstacle clearance zone", () => {
    const context = buildPanelLayoutContext(
      [makeRoofElement(1)],
      [makeObstacle(2, roofCenter.lat, roofCenter.lng)]
    );
    const panel = createPanelFeatureAtCenter(roofCenter, "standard-residential");
    const validation = validatePanelPlacement(panel, context);

    expect(validation.isValid).toBe(false);
    expect(validation.failures).toContain("intersects-exclusion");
  });
});

describe("PANEL_TYPES", () => {
  it("defines positive physical dimensions for every panel type", () => {
    Object.values(PANEL_TYPES).forEach((panelType) => {
      expect(panelType.widthM).toBeGreaterThan(0);
      expect(panelType.heightM).toBeGreaterThan(0);
      expect(panelType.kw).toBeGreaterThan(0);
    });
  });
});
