import * as SunCalc from "suncalc";
import { getRoofFootprintCenter } from "@/lib/sunProjection";
import { Coordinates, ObstacleMarker, RoofElement } from "@/types";

type XYPoint = {
  x: number;
  y: number;
};

type SolarSample = {
  altitudeRadians: number;
  shadowDirection: XYPoint;
  sunDirection: XYPoint;
  weight: number;
};

type ShadowObstacle = {
  center: XYPoint;
  heightM: number;
  radiusM: number;
};

type CellResult = {
  center: XYPoint;
  corners: Coordinates[];
  score: number;
};

export interface SolarHeatCell {
  corners: Coordinates[];
  score: number;
  displayScore: number;
  fillColor: string;
  fillOpacity: number;
}

export interface SolarHeatmap {
  cells: SolarHeatCell[];
  bestZoneLabel: string;
  averageExposurePercent: number;
  peakExposurePercent: number;
  isUniform: boolean;
}

type SolarHeatmapOptions = {
  obstacleMarkers: ObstacleMarker[];
};

const EARTH_RADIUS_METERS = 6_371_000;
const TARGET_CELL_COUNT = 144;
const MIN_CELL_SIZE_METERS = 0.9;
const MAX_CELL_SIZE_METERS = 2.2;
const TIME_STEP_HOURS = 0.5;
const DEFAULT_OBSTACLE_HEIGHT_METERS = 1.2;
const DEFAULT_OBSTACLE_RADIUS_METERS = 0.75;
const UNIFORM_VARIANCE_THRESHOLD = 0.06;
const RELATIVE_RANGE_FLOOR = 0.02;
const DIRECTIONAL_WEIGHT = 0.35;
const SHADOW_WEIGHT = 0.65;

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

function getCompassDegrees(azimuthRadians: number) {
  return (toDegrees(azimuthRadians) + 180 + 360) % 360;
}

function createSeasonDate(month: number, day: number, timeOfDay: number) {
  const currentYear = new Date().getFullYear();
  const hours = Math.floor(timeOfDay);
  const minutes = Math.round((timeOfDay - hours) * 60);

  return new Date(currentYear, month, day, hours, minutes, 0, 0);
}

function createSolarSamples(origin: Coordinates) {
  const samples: SolarSample[] = [];
  const seasonAnchors = [
    { month: 2, day: 21, weight: 0.2 },
    { month: 5, day: 21, weight: 0.3 },
    { month: 8, day: 21, weight: 0.2 },
    { month: 11, day: 21, weight: 0.3 },
  ];

  seasonAnchors.forEach(({ month, day, weight: seasonWeight }) => {
    for (let timeOfDay = 6; timeOfDay <= 18; timeOfDay += TIME_STEP_HOURS) {
      const date = createSeasonDate(month, day, timeOfDay);
      const sunPosition = SunCalc.getPosition(date, origin.lat, origin.lng);

      if (sunPosition.altitude <= 0) {
        continue;
      }

      const sunAzimuthDegrees = getCompassDegrees(sunPosition.azimuth);
      const sunVector = {
        x: Math.sin(toRadians(sunAzimuthDegrees)),
        y: Math.cos(toRadians(sunAzimuthDegrees)),
      };

      samples.push({
        altitudeRadians: sunPosition.altitude,
        shadowDirection: {
          x: -sunVector.x,
          y: -sunVector.y,
        },
        sunDirection: sunVector,
        weight: Math.sin(sunPosition.altitude) * TIME_STEP_HOURS * seasonWeight,
      });
    }
  });

  return samples;
}

function getCellSize(areaSqM: number) {
  return clamp(Math.sqrt(areaSqM / TARGET_CELL_COUNT), MIN_CELL_SIZE_METERS, MAX_CELL_SIZE_METERS);
}

function createShadowObstacles(origin: Coordinates, obstacleMarkers: ObstacleMarker[]) {
  return obstacleMarkers.map((marker) => ({
    center: projectToMeters([marker.position[1], marker.position[0]], origin),
    heightM: marker.estimatedHeightM ?? DEFAULT_OBSTACLE_HEIGHT_METERS,
    radiusM: DEFAULT_OBSTACLE_RADIUS_METERS,
  }));
}

function isPointShadowed(point: XYPoint, obstacle: ShadowObstacle, sample: SolarSample) {
  const tangent = Math.tan(sample.altitudeRadians);
  if (tangent <= Number.EPSILON) {
    return false;
  }

  const shadowLength = obstacle.heightM / tangent;
  if (shadowLength <= 0) {
    return false;
  }

  const dx = point.x - obstacle.center.x;
  const dy = point.y - obstacle.center.y;
  const alongShadow = dx * sample.shadowDirection.x + dy * sample.shadowDirection.y;

  if (alongShadow < 0 || alongShadow > shadowLength) {
    return false;
  }

  const perpendicular = Math.abs(dx * sample.shadowDirection.y - dy * sample.shadowDirection.x);
  const effectiveRadius = obstacle.radiusM + obstacle.heightM * 0.18;

  return perpendicular <= effectiveRadius;
}

function getDirectionalOpennessScore(point: XYPoint, roofPoints: XYPoint[], sample: SolarSample) {
  let minProjection = Number.POSITIVE_INFINITY;
  let maxProjection = Number.NEGATIVE_INFINITY;

  roofPoints.forEach((roofPoint) => {
    const projection = roofPoint.x * sample.sunDirection.x + roofPoint.y * sample.sunDirection.y;
    minProjection = Math.min(minProjection, projection);
    maxProjection = Math.max(maxProjection, projection);
  });

  const span = maxProjection - minProjection;
  if (span <= Number.EPSILON) {
    return 0.5;
  }

  const pointProjection = point.x * sample.sunDirection.x + point.y * sample.sunDirection.y;
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
    return blendHex("#3b82f6", "#fcd34d", score / 0.5);
  }

  return blendHex("#fcd34d", "#bef264", (score - 0.5) / 0.5);
}

function getRelativeDisplayScore(score: number, minScore: number, maxScore: number, isUniform: boolean) {
  if (isUniform) {
    return 0.56;
  }

  const range = Math.max(maxScore - minScore, RELATIVE_RANGE_FLOOR);
  return clamp((score - minScore) / range, 0, 1);
}

function getZoneLabel(point: XYPoint, bounds: { minX: number; maxX: number; minY: number; maxY: number }) {
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const xSpan = bounds.maxX - bounds.minX;
  const ySpan = bounds.maxY - bounds.minY;
  const xDelta = xSpan > Number.EPSILON ? (point.x - midX) / xSpan : 0;
  const yDelta = ySpan > Number.EPSILON ? (point.y - midY) / ySpan : 0;
  const horizontal = Math.abs(xDelta) < 0.12 ? "Center" : xDelta > 0 ? "East" : "West";
  const vertical = Math.abs(yDelta) < 0.12 ? "Center" : yDelta > 0 ? "North" : "South";

  if (horizontal === "Center" && vertical === "Center") {
    return "Center zone";
  }
  if (horizontal === "Center") {
    return `${vertical} zone`;
  }
  if (vertical === "Center") {
    return `${horizontal} zone`;
  }

  return `${vertical}-${horizontal} zone`;
}

export function calculateSolarHeatmap(
  roofElement: RoofElement,
  { obstacleMarkers }: SolarHeatmapOptions
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

  const solarSamples = createSolarSamples(center);
  if (solarSamples.length === 0) {
    return null;
  }

  const shadowObstacles = createShadowObstacles(center, obstacleMarkers);
  const roofAreaSqM = polygonAreaSqM(roofPoints);
  const cellSize = getCellSize(roofAreaSqM);
  const cellFootprint = cellSize * 0.88;
  const halfCell = cellFootprint / 2;
  const bounds = getBounds(roofPoints);
  const totalAvailableWeight = solarSamples.reduce((sum, sample) => sum + sample.weight, 0);
  const cellResults: CellResult[] = [];

  for (let x = bounds.minX; x <= bounds.maxX; x += cellSize) {
    for (let y = bounds.minY; y <= bounds.maxY; y += cellSize) {
      const centerPoint = {
        x: x + cellSize / 2,
        y: y + cellSize / 2,
      };

      if (!isPointInsidePolygon(centerPoint, roofPoints)) {
        continue;
      }

      let exposedWeight = 0;
      let directionalWeight = 0;

      solarSamples.forEach((sample) => {
        const blocked = shadowObstacles.some((obstacle) => isPointShadowed(centerPoint, obstacle, sample));
        if (!blocked) {
          exposedWeight += sample.weight;
        }
        directionalWeight += getDirectionalOpennessScore(centerPoint, roofPoints, sample) * sample.weight;
      });

      const shadowScore = totalAvailableWeight > 0 ? clamp(exposedWeight / totalAvailableWeight, 0, 1) : 0;
      const opennessScore = totalAvailableWeight > 0 ? clamp(directionalWeight / totalAvailableWeight, 0, 1) : 0.5;
      const score = clamp(shadowScore * SHADOW_WEIGHT + opennessScore * DIRECTIONAL_WEIGHT, 0, 1);
      const corners = [
        { x: centerPoint.x - halfCell, y: centerPoint.y - halfCell },
        { x: centerPoint.x + halfCell, y: centerPoint.y - halfCell },
        { x: centerPoint.x + halfCell, y: centerPoint.y + halfCell },
        { x: centerPoint.x - halfCell, y: centerPoint.y + halfCell },
      ].map((point) => unprojectFromMeters(point, center));

      cellResults.push({
        center: centerPoint,
        corners,
        score,
      });
    }
  }

  if (cellResults.length === 0) {
    return null;
  }

  const minScore = Math.min(...cellResults.map((cell) => cell.score));
  const maxScore = Math.max(...cellResults.map((cell) => cell.score));
  const isUniform = maxScore - minScore < UNIFORM_VARIANCE_THRESHOLD;
  const bestCells = cellResults.filter((cell) => cell.score >= maxScore - 0.03);
  const bestZoneCenter = bestCells.reduce(
    (sum, cell) => ({
      x: sum.x + cell.center.x / bestCells.length,
      y: sum.y + cell.center.y / bestCells.length,
    }),
    { x: 0, y: 0 }
  );
  const averageExposureScore = cellResults.reduce((sum, cell) => sum + cell.score, 0) / cellResults.length;
  const cells = cellResults.map((cell) => ({
    corners: cell.corners,
    score: cell.score,
    displayScore: getRelativeDisplayScore(cell.score, minScore, maxScore, isUniform),
    fillColor: getHeatColor(getRelativeDisplayScore(cell.score, minScore, maxScore, isUniform)),
    fillOpacity: clamp(
      isUniform ? 0.28 : 0.22 + getRelativeDisplayScore(cell.score, minScore, maxScore, isUniform) * 0.3,
      0.22,
      0.54
    ),
  }));

  return {
    cells,
    bestZoneLabel: isUniform ? "Mostly uniform roof exposure" : getZoneLabel(bestZoneCenter, bounds),
    averageExposurePercent: Math.round(averageExposureScore * 100),
    peakExposurePercent: Math.round(maxScore * 100),
    isUniform,
  };
}
