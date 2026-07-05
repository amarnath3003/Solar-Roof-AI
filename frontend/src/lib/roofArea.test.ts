// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import L from "leaflet";
import { calculateRoofAreaSummary } from "./roofArea";

// ~0.0001 deg latitude ≈ 11.1m; build a roughly 11m x 11m square at the equator.
const SQUARE: [number, number][] = [
  [0, 0],
  [0.0001, 0],
  [0.0001, 0.0001],
  [0, 0.0001],
];
const SQUARE_SIDE_M = 11.1;
const SQ_M_TO_SQ_FT = 10.7639;

describe("calculateRoofAreaSummary", () => {
  it("returns null without a feature group", () => {
    expect(calculateRoofAreaSummary(null)).toBeNull();
  });

  it("returns null when the group has no roof shapes", () => {
    const group = new L.FeatureGroup();
    group.addLayer(L.marker([0, 0]));

    expect(calculateRoofAreaSummary(group)).toBeNull();
  });

  it("measures a square polygon roof", () => {
    const group = new L.FeatureGroup();
    group.addLayer(L.polygon(SQUARE));

    const summary = calculateRoofAreaSummary(group);

    expect(summary).not.toBeNull();
    const expectedSqFt = SQUARE_SIDE_M * SQUARE_SIDE_M * SQ_M_TO_SQ_FT;
    expect(summary!.grossSqFt).toBeGreaterThan(expectedSqFt * 0.9);
    expect(summary!.grossSqFt).toBeLessThan(expectedSqFt * 1.1);
    expect(summary!.blockedSqFt).toBe(0);
    expect(summary!.netSqFt).toBeCloseTo(summary!.grossSqFt, 5);
    expect(summary!.roofShapeCount).toBe(1);
  });

  it("measures a circle roof analytically", () => {
    const radiusM = 5;
    const group = new L.FeatureGroup();
    group.addLayer(L.circle([0, 0], { radius: radiusM }));

    const summary = calculateRoofAreaSummary(group);

    expect(summary).not.toBeNull();
    expect(summary!.grossSqFt).toBeCloseTo(Math.PI * radiusM * radiusM * SQ_M_TO_SQ_FT, 0);
  });

  it("subtracts obstacle clearance from the usable area", () => {
    const group = new L.FeatureGroup();
    group.addLayer(L.polygon(SQUARE));
    group.addLayer(L.marker([0.00005, 0.00005]));

    const summary = calculateRoofAreaSummary(group);

    expect(summary).not.toBeNull();
    expect(summary!.obstacleCount).toBe(1);
    expect(summary!.blockedSqFt).toBeGreaterThan(0);
    expect(summary!.netSqFt).toBeLessThan(summary!.grossSqFt);
    expect(summary!.netSqFt + summary!.blockedSqFt).toBeCloseTo(summary!.grossSqFt, 5);
  });

  it("never reports negative net area when obstacles blanket the roof", () => {
    const group = new L.FeatureGroup();
    group.addLayer(L.polygon(SQUARE));
    for (let x = 0; x <= 10; x += 1) {
      for (let y = 0; y <= 10; y += 1) {
        group.addLayer(L.marker([0.00001 * x, 0.00001 * y]));
      }
    }

    const summary = calculateRoofAreaSummary(group);

    expect(summary).not.toBeNull();
    expect(summary!.netSqFt).toBeGreaterThanOrEqual(0);
    expect(summary!.blockedSqFt).toBeLessThanOrEqual(summary!.grossSqFt);
  });
});
