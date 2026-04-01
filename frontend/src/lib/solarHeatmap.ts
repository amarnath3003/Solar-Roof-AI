import * as SunCalc from "suncalc";
import { SunProjectionSeason, getRoofFootprintCenter } from "@/lib/sunProjection";
import { Coordinates, RoofElement } from "@/types";

type XYPoint = {
  x: number;
  y: number;
};

type SolarSample = {
  azimuthDegrees: number;
  weight: number;
  axisVector: XYPoint;
};

export interface SolarHeatCell {
  corners: Coordinates[];
  score: number;
  fillColor: string;
  fillOpacity: number;
}

export interface SolarHeatmap {
  cells: SolarHeatCell[];
  bestSideLabel: string;
  recommendedAzimuthDegrees: number;
}

type SolarHeatmapOptions = {
  season: SunProjectionSeason;
  focusTimeOfDay: number;
};

const EARTH_RADIUS_METERS = 6_371_000;
const TARGET_CELL_COUNT = 110;
const MIN_CELL_SIZE_METERS = 1;
const MAX_CELL_SIZE_METERS = 2.5;
const HEATMAP_BLEND_SEASON = 0.72;
const HEATMAP_BLEND_FOCUS = 0.28;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeRing(ring: number[][]) {
  if (ring.length <= 1) {
    return ring;
  }

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];

  if (firstLng === lastLng && firstLat === lastLat) {
    return ring.slice(0, ring.length - 1);
  }

  return ring;
}

function getRingArea(ring: number[][]) {
  let area = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const [currentLng, currentLat] = ring[index];
    const [nextLng, nextLat] = ring[(index + 1) % ring.length];
    area += currentLng * nextLat - nextLng * currentLat;
  }

  return area / 2;
}

function getPrimaryRing(roofElement: RoofElement) {
  const geometry = roofElement.geoJSON.geometry;
  if (!geometry) {
    return null;
  }

  if (geometry.type === "Polygon") {
    return geometry.coordinates[0] ?? null;
  }

  if (geometry.type !== "MultiPolygon") {
    return null;
  }

  let selectedRing: number[][] | null = null;
  let selectedArea = 0;

  geometry.coordinates.forEach((polygon) => {
    const ring = polygon[0];
    if (!ring || ring.length < 3) {
      return;
    }

    const area = Math.abs(getRingArea(normalizeRing(ring)));
    if (area > selectedArea) {
      selectedArea = area;
      selectedRing = ring;
    }
  });

  return selectedRing;
}

function projectToMeters([lng, lat]: number[], origin: Coordinates): XYPoint {
  const avgLat = toRadians((lat + origin.lat) / 2);

  return {
    x: EARTH_RADIUS_METERS * toRadians(lng - origin.lng) * Math.cos(avgLat),
    y: EARTH_RADIUS_METERS * toRadians(lat - origin.lat),
  };
}

function unprojectFromMeters(point: XYPoint, origin: Coordinates): Coordinates {
  const originLatRadians = toRadians(origin.lat);

  return {
    lat: origin.lat + toDegrees(point.y / EARTH_RADIUS_METERS),
    lng: origin.lng + toDegrees(point.x / (EARTH_RADIUS_METERS * Math.cos(originLatRadians))),
  };
}

function polygonAreaSqM(points: XYPoint[]) {
  let area = 0;

  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

function isPointInsidePolygon(point: XYPoint, polygon: XYPoint[]) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          ((previousPoint.y - currentPoint.y) || Number.EPSILON) +
          currentPoint.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getBounds(points: XYPoint[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
}

function getUnitVectorFromAzimuth(azimuthDegrees: number): XYPoint {
  const radians = toRadians(azimuthDegrees);
  return {
    x: Math.sin(radians),
    y: Math.cos(radians),
  };
}

function getCompassDegrees(azimuthRadians: number) {
  return (toDegrees(azimuthRadians) + 180 + 360) % 360;
}

function createSeasonDate(season: SunProjectionSeason, timeOfDay: number) {
  const currentYear = new Date().getFullYear();
  const hours = Math.floor(timeOfDay);
  const minutes = Math.round((timeOfDay - hours) * 60);
  const month = season === "summer-solstice" ? 5 : 11;
  const day = 21;

  return new Date(currentYear, month, day, hours, minutes, 0, 0);
}

function createSolarSample(origin: Coordinates, season: SunProjectionSeason, timeOfDay: number): SolarSample | null {
  const date = createSeasonDate(season, timeOfDay);
  const sunPosition = SunCalc.getPosition(date, origin.lat, origin.lng);
  const altitudeWeight = Math.max(0, Math.sin(sunPosition.altitude));

  if (altitudeWeight <= 0) {
    return null;
  }

  const azimuthDegrees = getCompassDegrees(sunPosition.azimuth);

  return {
    azimuthDegrees,
    weight: altitudeWeight,
    axisVector: getUnitVectorFromAzimuth(azimuthDegrees),
  };
}

function getDirectionalScore(point: XYPoint, roofPoints: XYPoint[], axisVector: XYPoint) {
  let minProjection = Number.POSITIVE_INFINITY;
  let maxProjection = Number.NEGATIVE_INFINITY;

  roofPoints.forEach((roofPoint) => {
    const projection = roofPoint.x * axisVector.x + roofPoint.y * axisVector.y;
    minProjection = Math.min(minProjection, projection);
    maxProjection = Math.max(maxProjection, projection);
  });

  const span = maxProjection - minProjection;
  if (span <= Number.EPSILON) {
    return 0.5;
  }

  const pointProjection = point.x * axisVector.x + point.y * axisVector.y;
  return clamp((pointProjection - minProjection) / span, 0, 1);
}

function interpolateChannel(start: number, end: number, amount: number) {
  return Math.round(start + (end - start) * amount);
}

function blendHex(start: string, end: string, amount: number) {
  const safeAmount = clamp(amount, 0, 1);
  const startR = Number.parseInt(start.slice(1, 3), 16);
  const startG = Number.parseInt(start.slice(3, 5), 16);
  const startB = Number.parseInt(start.slice(5, 7), 16);
  const endR = Number.parseInt(end.slice(1, 3), 16);
  const endG = Number.parseInt(end.slice(3, 5), 16);
  const endB = Number.parseInt(end.slice(5, 7), 16);

  return `#${interpolateChannel(startR, endR, safeAmount).toString(16).padStart(2, "0")}${interpolateChannel(
    startG,
    endG,
    safeAmount
  )
    .toString(16)
    .padStart(2, "0")}${interpolateChannel(startB, endB, safeAmount).toString(16).padStart(2, "0")}`;
}

function getHeatColor(score: number) {
  if (score <= 0.5) {
    return blendHex("#1d4ed8", "#f59e0b", score / 0.5);
  }

  return blendHex("#f59e0b", "#a3e635", (score - 0.5) / 0.5);
}

function getBearingLabel(bearingDegrees: number) {
  const labels = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"];
  const index = Math.round((((bearingDegrees % 360) + 360) % 360) / 45) % labels.length;
  return labels[index];
}

function getBearingFromVector(vector: XYPoint) {
  return (toDegrees(Math.atan2(vector.x, vector.y)) + 360) % 360;
}

function getCellSize(areaSqM: number) {
  return clamp(Math.sqrt(areaSqM / TARGET_CELL_COUNT), MIN_CELL_SIZE_METERS, MAX_CELL_SIZE_METERS);
}

export function calculateSolarHeatmap(
  roofElement: RoofElement,
  { season, focusTimeOfDay }: SolarHeatmapOptions
): SolarHeatmap | null {
  const center = getRoofFootprintCenter(roofElement);
  const ring = getPrimaryRing(roofElement);

  if (!center || !ring) {
    return null;
  }

  const roofPoints = normalizeRing(ring).map((point) => projectToMeters(point, center));
  if (roofPoints.length < 3) {
    return null;
  }

  const seasonalSamples = Array.from({ length: 13 }, (_, index) => 6 + index)
    .map((timeOfDay) => createSolarSample(center, season, timeOfDay))
    .filter((sample): sample is SolarSample => sample !== null);

  if (seasonalSamples.length === 0) {
    return null;
  }

  const focusSample = createSolarSample(center, season, focusTimeOfDay);
  const roofAreaSqM = polygonAreaSqM(roofPoints);
  const cellSize = getCellSize(roofAreaSqM);
  const cellFootprint = cellSize * 0.88;
  const halfCell = cellFootprint / 2;
  const bounds = getBounds(roofPoints);
  const averageSunWeight =
    seasonalSamples.reduce((sum, sample) => sum + sample.weight, 0) / seasonalSamples.length;

  const dominantVector = seasonalSamples.reduce(
    (vector, sample) => ({
      x: vector.x + sample.axisVector.x * sample.weight,
      y: vector.y + sample.axisVector.y * sample.weight,
    }),
    { x: 0, y: 0 }
  );
  const recommendedAzimuthDegrees =
    Math.abs(dominantVector.x) + Math.abs(dominantVector.y) > Number.EPSILON
      ? getBearingFromVector(dominantVector)
      : focusSample?.azimuthDegrees ?? 180;

  const cells: SolarHeatCell[] = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
    for (let y = bounds.minY; y <= bounds.maxY; y += cellSize) {
      const centerPoint = {
        x: x + cellSize / 2,
        y: y + cellSize / 2,
      };

      if (!isPointInsidePolygon(centerPoint, roofPoints)) {
        continue;
      }

      const seasonalScoreTotal = seasonalSamples.reduce(
        (sum, sample) => sum + getDirectionalScore(centerPoint, roofPoints, sample.axisVector) * sample.weight,
        0
      );
      const seasonalWeightTotal = seasonalSamples.reduce((sum, sample) => sum + sample.weight, 0);
      const seasonalScore = seasonalWeightTotal > 0 ? seasonalScoreTotal / seasonalWeightTotal : 0.5;
      const focusScore = focusSample ? getDirectionalScore(centerPoint, roofPoints, focusSample.axisVector) : seasonalScore;
      const score = clamp(seasonalScore * HEATMAP_BLEND_SEASON + focusScore * HEATMAP_BLEND_FOCUS, 0, 1);
      const fillOpacity = clamp((0.16 + score * 0.22) * (0.7 + averageSunWeight * 0.45), 0.12, 0.44);
      const corners = [
        { x: centerPoint.x - halfCell, y: centerPoint.y - halfCell },
        { x: centerPoint.x + halfCell, y: centerPoint.y - halfCell },
        { x: centerPoint.x + halfCell, y: centerPoint.y + halfCell },
        { x: centerPoint.x - halfCell, y: centerPoint.y + halfCell },
      ].map((point) => unprojectFromMeters(point, center));

      cells.push({
        corners,
        score,
        fillColor: getHeatColor(score),
        fillOpacity,
      });
    }
  }

  if (cells.length === 0) {
    return null;
  }

  return {
    cells,
    bestSideLabel: `${getBearingLabel(recommendedAzimuthDegrees)} edge`,
    recommendedAzimuthDegrees,
  };
}
