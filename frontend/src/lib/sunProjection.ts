import { centroid, destination, point } from "@turf/turf";
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

  const centerPoint = centroid(roofElement.geoJSON as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>);
  const [lng, lat] = centerPoint.geometry.coordinates;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
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
  const endpointPoint = destination(
    point([center.lng, center.lat]),
    SUN_PATH_LENGTH_METERS / 1000,
    azimuthDegrees,
    { units: "kilometers" }
  );
  const [endpointLng, endpointLat] = endpointPoint.geometry.coordinates;

  return {
    center,
    endpoint: {
      lat: endpointLat,
      lng: endpointLng,
    },
    azimuthDegrees,
    altitudeDegrees,
    date,
    timeLabel: formatTimeOfDay(timeOfDay),
    season,
    isAboveHorizon: sunPosition.altitude > 0,
  };
}
