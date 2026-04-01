import L from "leaflet";
import { RoofAreaSummary } from "@/types";

const EARTH_RADIUS_M = 6_378_137;
const FEET_PER_METER = 3.28084;
export const OBSTACLE_CLEARANCE_FEET = 3;
const OBSTACLE_CLEARANCE_M = OBSTACLE_CLEARANCE_FEET / FEET_PER_METER;
const SAMPLE_STEP_M = 0.25;

type XYPoint = {
  x: number;
  y: number;
};

type XYBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type PolygonShape = {
  kind: "polygon";
  points: XYPoint[];
  bounds: XYBounds;
};

type CircleShape = {
  kind: "circle";
  center: XYPoint;
  radius: number;
  bounds: XYBounds;
};

type RoofShape = PolygonShape | CircleShape;

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function projectToMeters(point: L.LatLng, origin: L.LatLng): XYPoint {
  const avgLat = toRadians((point.lat + origin.lat) / 2);

  return {
    x: EARTH_RADIUS_M * toRadians(point.lng - origin.lng) * Math.cos(avgLat),
    y: EARTH_RADIUS_M * toRadians(point.lat - origin.lat),
  };
}

function getPolygonRing(layer: L.Polygon): L.LatLng[] {
  const latLngs = layer.getLatLngs();
  if (!Array.isArray(latLngs) || latLngs.length === 0) {
    return [];
  }

  return (Array.isArray(latLngs[0]) ? latLngs[0] : latLngs) as L.LatLng[];
}

function getBounds(points: XYPoint[]): XYBounds {
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

function isPointInsideRoof(point: XYPoint, roofShape: RoofShape) {
  if (roofShape.kind === "circle") {
    const dx = point.x - roofShape.center.x;
    const dy = point.y - roofShape.center.y;
    return dx * dx + dy * dy <= roofShape.radius * roofShape.radius;
  }

  return isPointInsidePolygon(point, roofShape.points);
}

function toSqFt(squareMeters: number) {
  return squareMeters * FEET_PER_METER * FEET_PER_METER;
}

function estimateBlockedAreaSqM(roofShape: RoofShape, obstaclePoints: XYPoint[]) {
  if (obstaclePoints.length === 0) {
    return 0;
  }

  let blockedSamples = 0;
  const { minX, maxX, minY, maxY } = roofShape.bounds;

  for (let x = minX + SAMPLE_STEP_M / 2; x <= maxX; x += SAMPLE_STEP_M) {
    for (let y = minY + SAMPLE_STEP_M / 2; y <= maxY; y += SAMPLE_STEP_M) {
      const point = { x, y };
      if (!isPointInsideRoof(point, roofShape)) {
        continue;
      }

      const blocked = obstaclePoints.some((obstaclePoint) => {
        const dx = x - obstaclePoint.x;
        const dy = y - obstaclePoint.y;
        return dx * dx + dy * dy <= OBSTACLE_CLEARANCE_M * OBSTACLE_CLEARANCE_M;
      });

      if (blocked) {
        blockedSamples += 1;
      }
    }
  }

  return blockedSamples * SAMPLE_STEP_M * SAMPLE_STEP_M;
}

function createPolygonShape(layer: L.Polygon, obstacleLatLngs: L.LatLng[]) {
  const ring = getPolygonRing(layer);
  if (ring.length < 3) {
    return null;
  }

  const origin = ring[0];
  const points = ring.map((point) => projectToMeters(point, origin));

  return {
    roofShape: {
      kind: "polygon",
      points,
      bounds: getBounds(points),
    } satisfies PolygonShape,
    obstaclePoints: obstacleLatLngs.map((obstacle) => projectToMeters(obstacle, origin)),
  };
}

function createCircleShape(layer: L.Circle, obstacleLatLngs: L.LatLng[]) {
  const origin = layer.getLatLng();
  const center = { x: 0, y: 0 };
  const radius = layer.getRadius();

  return {
    roofShape: {
      kind: "circle",
      center,
      radius,
      bounds: {
        minX: center.x - radius,
        maxX: center.x + radius,
        minY: center.y - radius,
        maxY: center.y + radius,
      },
    } satisfies CircleShape,
    obstaclePoints: obstacleLatLngs.map((obstacle) => projectToMeters(obstacle, origin)),
  };
}

export function calculateRoofAreaSummary(featureGroup: L.FeatureGroup | null): RoofAreaSummary | null {
  if (!featureGroup) {
    return null;
  }

  const roofLayers: Array<L.Polygon | L.Circle> = [];
  const obstacleLatLngs: L.LatLng[] = [];
  let ignoredRoofShapes = 0;

  featureGroup.eachLayer((layer) => {
    if (layer instanceof L.Marker) {
      obstacleLatLngs.push(layer.getLatLng());
      return;
    }

    if (layer instanceof L.Circle) {
      roofLayers.push(layer);
      return;
    }

    if (layer instanceof L.Polygon) {
      roofLayers.push(layer);
      return;
    }

    ignoredRoofShapes += 1;
  });

  if (roofLayers.length === 0) {
    return null;
  }

  let grossSqM = 0;
  let blockedSqM = 0;

  roofLayers.forEach((layer) => {
    if (layer instanceof L.Circle) {
      const { roofShape, obstaclePoints } = createCircleShape(layer, obstacleLatLngs);
      grossSqM += Math.PI * roofShape.radius * roofShape.radius;
      blockedSqM += estimateBlockedAreaSqM(roofShape, obstaclePoints);
      return;
    }

    const shapePayload = createPolygonShape(layer, obstacleLatLngs);
    if (!shapePayload) {
      ignoredRoofShapes += 1;
      return;
    }

    grossSqM += polygonAreaSqM(shapePayload.roofShape.points);
    blockedSqM += estimateBlockedAreaSqM(shapePayload.roofShape, shapePayload.obstaclePoints);
  });

  const limitedBlockedSqM = Math.min(blockedSqM, grossSqM);
  const netSqM = Math.max(grossSqM - limitedBlockedSqM, 0);

  return {
    grossSqFt: toSqFt(grossSqM),
    blockedSqFt: toSqFt(limitedBlockedSqM),
    netSqFt: toSqFt(netSqM),
    roofShapeCount: roofLayers.length,
    obstacleCount: obstacleLatLngs.length,
    obstacleClearanceFeet: OBSTACLE_CLEARANCE_FEET,
    ignoredRoofShapes,
  };
}
