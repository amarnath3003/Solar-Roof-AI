import * as SunCalc from "suncalc";
import { Coordinates, RoofElement } from "@/types";

export const SUN_PATH_LENGTH_METERS = 50;

export type SunProjectionSeason = "summer-solstice" | "winter-solstice";

export interface SunProjection {
  center: Coordinates;
  endpoint: Coordinates;
  azimuthDegrees: number;
  altitudeDegrees: number;
  date: Date;
  timeLabel: string;
  season: SunProjectionSeason;
  isAboveHorizon: boolean;
}

type SunProjectionOptions = {
  season: SunProjectionSeason;
  timeOfDay: number;
};

const SEASON_CONFIG: Record<
  SunProjectionSeason,
  {
    label: string;
    month: number;
    day: number;
  }
> = {
  "summer-solstice": {
    label: "Summer Solstice",
    month: 5,
    day: 21,
  },
  "winter-solstice": {
    label: "Winter Solstice",
    month: 11,
    day: 21,
  },
};

const EARTH_RADIUS_METERS = 6_371_000;

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function toCompassDegrees(azimuthRadians: number) {
  return (toDegrees(azimuthRadians) + 180 + 360) % 360;
}

function formatTimeOfDay(timeOfDay: number) {
  const hours = Math.floor(timeOfDay);
  const minutes = Math.round((timeOfDay - hours) * 60);
  const normalizedHours = minutes === 60 ? hours + 1 : hours;
  const normalizedMinutes = minutes === 60 ? 0 : minutes;
  const period = normalizedHours >= 12 ? "PM" : "AM";
  const displayHour = normalizedHours % 12 || 12;

  return `${displayHour}:${normalizedMinutes.toString().padStart(2, "0")} ${period}`;
}

function createSeasonDate(season: SunProjectionSeason, timeOfDay: number) {
  const { month, day } = SEASON_CONFIG[season];
  const currentYear = new Date().getFullYear();
  const hours = Math.floor(timeOfDay);
  const minutes = Math.round((timeOfDay - hours) * 60);

  return new Date(currentYear, month, day, hours, minutes, 0, 0);
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

function getRingCentroid(ring: number[][]): Coordinates | null {
  const normalizedRing = normalizeRing(ring);
  if (normalizedRing.length < 3) {
    return null;
  }

  const signedArea = getRingArea(normalizedRing);
  if (Math.abs(signedArea) < Number.EPSILON) {
    const total = normalizedRing.reduce(
      (sum, [lng, lat]) => ({
        lat: sum.lat + lat,
        lng: sum.lng + lng,
      }),
      { lat: 0, lng: 0 }
    );

    return {
      lat: total.lat / normalizedRing.length,
      lng: total.lng / normalizedRing.length,
    };
  }

  let centroidLng = 0;
  let centroidLat = 0;

  for (let index = 0; index < normalizedRing.length; index += 1) {
    const [currentLng, currentLat] = normalizedRing[index];
    const [nextLng, nextLat] = normalizedRing[(index + 1) % normalizedRing.length];
    const cross = currentLng * nextLat - nextLng * currentLat;
    centroidLng += (currentLng + nextLng) * cross;
    centroidLat += (currentLat + nextLat) * cross;
  }

  return {
    lng: centroidLng / (6 * signedArea),
    lat: centroidLat / (6 * signedArea),
  };
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

function projectPoint(origin: Coordinates, distanceMeters: number, bearingDegrees: number): Coordinates {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDegrees);
  const originLat = toRadians(origin.lat);
  const originLng = toRadians(origin.lng);
  const projectedLat = Math.asin(
    Math.sin(originLat) * Math.cos(angularDistance) +
      Math.cos(originLat) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const projectedLng =
    originLng +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(originLat),
      Math.cos(angularDistance) - Math.sin(originLat) * Math.sin(projectedLat)
    );

  return {
    lat: toDegrees(projectedLat),
    lng: toDegrees(projectedLng),
  };
}

function isSupportedRoofGeometry(roofElement: RoofElement) {
  const geometryType = roofElement.geoJSON.geometry?.type;
  return geometryType === "Polygon" || geometryType === "MultiPolygon";
}

export function getSunSeasonLabel(season: SunProjectionSeason) {
  return SEASON_CONFIG[season].label;
}

export function getActiveRoofFootprint(roofElements: RoofElement[]) {
  for (let index = roofElements.length - 1; index >= 0; index -= 1) {
    const roofElement = roofElements[index];
    if (isSupportedRoofGeometry(roofElement)) {
      return roofElement;
    }
  }

  return null;
}

export function getRoofFootprintCenter(roofElement: RoofElement): Coordinates | null {
  if (!isSupportedRoofGeometry(roofElement)) {
    return null;
  }

  const primaryRing = getPrimaryRing(roofElement);
  if (!primaryRing) {
    return null;
  }

  const center = getRingCentroid(primaryRing);
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) {
    return null;
  }

  return center;
}

export function calculateSunProjection(
  roofElement: RoofElement,
  { season, timeOfDay }: SunProjectionOptions
): SunProjection | null {
  const center = getRoofFootprintCenter(roofElement);
  if (!center) {
    return null;
  }

  const date = createSeasonDate(season, timeOfDay);
  const sunPosition = SunCalc.getPosition(date, center.lat, center.lng);
  const azimuthDegrees = toCompassDegrees(sunPosition.azimuth);
  const altitudeDegrees = toDegrees(sunPosition.altitude);
  const endpoint = projectPoint(center, SUN_PATH_LENGTH_METERS, azimuthDegrees);

  return {
    center,
    endpoint,
    azimuthDegrees,
    altitudeDegrees,
    date,
    timeLabel: formatTimeOfDay(timeOfDay),
    season,
    isAboveHorizon: sunPosition.altitude > 0,
  };
}
