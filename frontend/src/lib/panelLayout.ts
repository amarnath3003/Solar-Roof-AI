import {
  area as turfArea,
  bbox as turfBbox,
  booleanContains,
  booleanDisjoint,
  booleanIntersects,
  buffer as turfBuffer,
  circle as turfCircle,
  centerOfMass,
  point,
  polygon,
} from "@turf/turf";
import type { SolarHeatmap } from "@/lib/solarHeatmap";
import { Coordinates, ObstacleMarker, PanelLayoutContext, PanelTypeDefinition, PanelTypeId, RoofElement } from "@/types";

type SupportedLayoutFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.LineString | GeoJSON.MultiLineString
>;

export type PanelPlacementFailure =
  | "missing-roof"
  | "outside-roof"
  | "intersects-exclusion"
  | "intersects-setback"
  | "intersects-panel";

export interface PanelPlacementValidation {
  isValid: boolean;
  failures: PanelPlacementFailure[];
}

export interface AutoPackPanelsResult {
  panels: GeoJSON.Feature<GeoJSON.Polygon>[];
  attempts: number;
}

export interface AutoPackCapacityResult extends AutoPackPanelsResult {
  panelCount: number;
}

export interface AutoPackPanelsOptions {
  maxPanels?: number;
  solarHeatmap?: SolarHeatmap | null;
}

const GRID_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.5, 0],
  [0, 0.5],
  [0.5, 0.5],
];

const DISTANCE_UNITS_KM = "kilometers";
const BUFFER_UNITS_M = "meters";
const EPSILON = 1e-9;
const DEFAULT_OBSTACLE_CLEARANCE_METERS = 0.7;
const EARTH_RADIUS_METERS = 6_371_000;

export const PANEL_TYPES: Record<PanelTypeId, PanelTypeDefinition> = {
  "standard-residential": {
    id: "standard-residential",
    label: "Standard Residential",
    widthM: 0.99,
    heightM: 1.65,
    kw: 0.4,
  },
  "large-commercial": {
    id: "large-commercial",
    label: "Large Commercial",
    widthM: 1,
    heightM: 1.98,
    kw: 0.4,
  },
};

type XYPoint = {
  x: number;
  y: number;
};

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}

function projectToMeters([lng, lat]: number[], origin: Coordinates): XYPoint {
  const avgLat = toRadians((lat + origin.lat) / 2);

  return {
    x: EARTH_RADIUS_METERS * toRadians(lng - origin.lng) * Math.cos(avgLat),
    y: EARTH_RADIUS_METERS * toRadians(lat - origin.lat),
  };
}

function unprojectFromMeters(pointInMeters: XYPoint, origin: Coordinates): [number, number] {
  const originLatRadians = toRadians(origin.lat);

  return [
    origin.lng + toDegrees(pointInMeters.x / (EARTH_RADIUS_METERS * Math.cos(originLatRadians))),
    origin.lat + toDegrees(pointInMeters.y / EARTH_RADIUS_METERS),
  ];
}

function rotatePoint(pointInMeters: XYPoint, clockwiseDegrees: number): XYPoint {
  const radians = toRadians(clockwiseDegrees);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: pointInMeters.x * cos + pointInMeters.y * sin,
    y: -pointInMeters.x * sin + pointInMeters.y * cos,
  };
}

function getReferenceCenter(feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>): Coordinates {
  const [lng, lat] = centerOfMass(feature).geometry.coordinates;
  return { lat, lng };
}

function isPolygonFeature(
  feature: SupportedLayoutFeature
): feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon";
}

function toSupportedLayoutFeature(roofElement: RoofElement): SupportedLayoutFeature | null {
  const geometry = roofElement.geoJSON.geometry;
  if (!geometry) {
    return null;
  }

  if (
    geometry.type === "Polygon" ||
    geometry.type === "MultiPolygon" ||
    geometry.type === "LineString" ||
    geometry.type === "MultiLineString"
  ) {
    return roofElement.geoJSON as SupportedLayoutFeature;
  }

  return null;
}

function createPanelFeatureFromLocalCenter(
  localCenter: XYPoint,
  referenceCenter: Coordinates,
  panelTypeId: PanelTypeId,
  alignmentAngleDegrees: number
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { widthM, heightM } = PANEL_TYPES[panelTypeId];
  const halfWidth = widthM / 2;
  const halfHeight = heightM / 2;
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ]
    .map((corner) =>
      rotatePoint(
        {
          x: localCenter.x + corner.x,
          y: localCenter.y + corner.y,
        },
        alignmentAngleDegrees
      )
    )
    .map((corner) => unprojectFromMeters(corner, referenceCenter));

  return polygon(
    [[corners[0], corners[1], corners[2], corners[3], corners[0]]],
    {
      panelTypeId,
      alignmentAngleDegrees,
    }
  );
}

function getValidUsableRoof(
  primaryRoof: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null,
  edgeBufferMeters: number
) {
  if (!primaryRoof) {
    return null;
  }

  if (edgeBufferMeters <= 0) {
    return primaryRoof;
  }

  const bufferedRoof = turfBuffer(primaryRoof, -edgeBufferMeters, {
    units: BUFFER_UNITS_M,
  });

  if (!bufferedRoof) {
    return null;
  }

  if (bufferedRoof.geometry.type !== "Polygon" && bufferedRoof.geometry.type !== "MultiPolygon") {
    return null;
  }

  return bufferedRoof as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
}

function isPanelInsideRoof(
  roof: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  panel: GeoJSON.Feature<GeoJSON.Polygon>
) {
  return booleanContains(roof, panel);
}

export function getPanelTypeDefinition(panelTypeId: PanelTypeId) {
  return PANEL_TYPES[panelTypeId];
}

function getObstacleClearanceMeters(obstacleMarker: ObstacleMarker) {
  if (typeof obstacleMarker.estimatedHeightM === "number" && Number.isFinite(obstacleMarker.estimatedHeightM)) {
    return Math.max(DEFAULT_OBSTACLE_CLEARANCE_METERS, obstacleMarker.estimatedHeightM * 0.35);
  }

  return DEFAULT_OBSTACLE_CLEARANCE_METERS;
}

function createObstacleExclusionZone(obstacleMarker: ObstacleMarker): GeoJSON.Feature<GeoJSON.Polygon> {
  return turfCircle([obstacleMarker.position[1], obstacleMarker.position[0]], getObstacleClearanceMeters(obstacleMarker) / 1000, {
    units: DISTANCE_UNITS_KM,
    steps: 24,
    properties: {
      obstacleId: obstacleMarker.id,
      obstacleSource: obstacleMarker.source,
      obstacleLabel: obstacleMarker.label,
    },
  }) as GeoJSON.Feature<GeoJSON.Polygon>;
}

export function buildPanelLayoutContext(
  roofElements: RoofElement[],
  obstacleMarkers: ObstacleMarker[] = [],
  edgeBufferMeters = 0
): PanelLayoutContext {
  const layoutFeatures = roofElements
    .map(toSupportedLayoutFeature)
    .filter((feature): feature is SupportedLayoutFeature => feature !== null);

  const polygonFeatures = layoutFeatures.filter(isPolygonFeature);
  const primaryRoof =
    polygonFeatures.reduce<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null>((selected, candidate) => {
      if (!selected || turfArea(candidate) > turfArea(selected)) {
        return candidate;
      }

      return selected;
    }, null) ?? null;

  const exclusionZones =
    primaryRoof === null
      ? []
      : layoutFeatures.filter(
          (feature): feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.LineString | GeoJSON.MultiLineString> =>
            feature !== primaryRoof && booleanIntersects(primaryRoof, feature)
        );

  const obstacleExclusionZones =
    primaryRoof === null
      ? []
      : obstacleMarkers
          .map(createObstacleExclusionZone)
          .filter((feature) => booleanIntersects(primaryRoof, feature));

  return {
    primaryRoof,
    exclusionZones: [...exclusionZones, ...obstacleExclusionZones],
    usableRoof: getValidUsableRoof(primaryRoof, edgeBufferMeters),
    edgeBufferMeters,
  };
}

export function validatePanelPlacement(
  panel: GeoJSON.Feature<GeoJSON.Polygon>,
  context: PanelLayoutContext,
  existingPanels: GeoJSON.Feature<GeoJSON.Polygon>[] = []
): PanelPlacementValidation {
  const failures = new Set<PanelPlacementFailure>();

  if (!context.primaryRoof) {
    failures.add("missing-roof");
    return {
      isValid: false,
      failures: Array.from(failures),
    };
  }

  const insidePrimaryRoof = isPanelInsideRoof(context.primaryRoof, panel);
  if (!insidePrimaryRoof) {
    failures.add("outside-roof");
  }

  if (insidePrimaryRoof && context.edgeBufferMeters > 0) {
    if (!context.usableRoof || !isPanelInsideRoof(context.usableRoof, panel)) {
      failures.add("intersects-setback");
    }
  }

  if (context.exclusionZones.some((zone) => !booleanDisjoint(panel, zone))) {
    failures.add("intersects-exclusion");
  }

  if (existingPanels.some((existingPanel) => !booleanDisjoint(panel, existingPanel))) {
    failures.add("intersects-panel");
  }

  return {
    isValid: failures.size === 0,
    failures: Array.from(failures),
  };
}

export function createPanelFeatureAtCenter(
  center: Coordinates,
  panelTypeId: PanelTypeId,
  alignmentAngleDegrees = 0
): GeoJSON.Feature<GeoJSON.Polygon> {
  return createPanelFeatureFromLocalCenter({ x: 0, y: 0 }, center, panelTypeId, alignmentAngleDegrees);
}

function getNormalizedMaxPanels(maxPanels?: number) {
  if (typeof maxPanels !== "number" || !Number.isFinite(maxPanels)) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.min(25, Math.max(0, Math.floor(maxPanels)));
}

function getPanelSolarScore(
  panel: GeoJSON.Feature<GeoJSON.Polygon>,
  solarHeatmap?: SolarHeatmap | null
) {
  if (!solarHeatmap || solarHeatmap.cells.length === 0) {
    return 0;
  }

  const coveredCells = solarHeatmap.cells.filter((cell) =>
    booleanContains(panel, point([cell.center.lng, cell.center.lat]))
  );

  if (coveredCells.length === 0) {
    return 0;
  }

  return coveredCells.reduce((sum, cell) => sum + cell.score, 0) / coveredCells.length;
}

function selectPreferredPanels(
  candidatePanels: GeoJSON.Feature<GeoJSON.Polygon>[],
  maxPanels: number,
  solarHeatmap?: SolarHeatmap | null
) {
  const rankedPanels = candidatePanels
    .map((panel, index) => ({
      panel,
      index,
      score: getPanelSolarScore(panel, solarHeatmap),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const selectedPanels = rankedPanels.slice(0, Math.min(rankedPanels.length, maxPanels));

  return {
    panels: selectedPanels.map(({ panel }) => panel),
    totalScore: selectedPanels.reduce((sum, panel) => sum + panel.score, 0),
  };
}

function runAutoPackPanels(
  context: PanelLayoutContext,
  panelTypeId: PanelTypeId,
  alignmentAngleDegrees = 0,
  maxPanels: number,
  solarHeatmap?: SolarHeatmap | null
): AutoPackPanelsResult {
  if (!context.primaryRoof) {
    return {
      panels: [],
      attempts: 0,
    };
  }

  const referenceCenter = getReferenceCenter(context.primaryRoof);
  const [minLng, minLat, maxLng, maxLat] = turfBbox(context.primaryRoof);
  const roofBoundsCorners: [number, number][] = [
    [minLng, minLat],
    [maxLng, minLat],
    [maxLng, maxLat],
    [minLng, maxLat],
  ];
  const rotatedRoofBoundsCorners = roofBoundsCorners.map((corner) =>
    rotatePoint(projectToMeters(corner, referenceCenter), -alignmentAngleDegrees)
  );
  const rotatedBounds = rotatedRoofBoundsCorners.reduce(
    (bounds, currentPoint) => ({
      minX: Math.min(bounds.minX, currentPoint.x),
      maxX: Math.max(bounds.maxX, currentPoint.x),
      minY: Math.min(bounds.minY, currentPoint.y),
      maxY: Math.max(bounds.maxY, currentPoint.y),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    }
  );
  const { widthM, heightM } = PANEL_TYPES[panelTypeId];
  let bestPanels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];
  let bestScore = Number.NEGATIVE_INFINITY;

  GRID_OFFSETS.forEach(([xOffsetFactor, yOffsetFactor]) => {
    const startX = rotatedBounds.minX + widthM * (0.5 + xOffsetFactor);
    let centerY = rotatedBounds.minY + heightM * (0.5 + yOffsetFactor);
    const candidatePanels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    while (centerY + heightM / 2 <= rotatedBounds.maxY + EPSILON) {
      let centerX = startX;
      while (centerX + widthM / 2 <= rotatedBounds.maxX + EPSILON) {
        const candidatePanel = createPanelFeatureFromLocalCenter(
          { x: centerX, y: centerY },
          referenceCenter,
          panelTypeId,
          alignmentAngleDegrees
        );
        if (validatePanelPlacement(candidatePanel, context, candidatePanels).isValid) {
          candidatePanels.push(candidatePanel);
        }
        centerX += widthM;
      }
      centerY += heightM;
    }

    const preferredPanels = selectPreferredPanels(candidatePanels, maxPanels, solarHeatmap);

    if (
      preferredPanels.panels.length > bestPanels.length ||
      (preferredPanels.panels.length === bestPanels.length && preferredPanels.totalScore > bestScore)
    ) {
      bestPanels = preferredPanels.panels;
      bestScore = preferredPanels.totalScore;
    }
  });

  return {
    panels: bestPanels,
    attempts: GRID_OFFSETS.length,
  };
}

export function autoPackPanels(
  context: PanelLayoutContext,
  panelTypeId: PanelTypeId,
  alignmentAngleDegrees = 0,
  options: AutoPackPanelsOptions = {}
): AutoPackPanelsResult {
  return runAutoPackPanels(
    context,
    panelTypeId,
    alignmentAngleDegrees,
    getNormalizedMaxPanels(options.maxPanels),
    options.solarHeatmap
  );
}

export function autoPackPanelsToCapacity(
  context: PanelLayoutContext,
  panelTypeId: PanelTypeId,
  alignmentAngleDegrees = 0,
  options: Omit<AutoPackPanelsOptions, "maxPanels"> = {}
): AutoPackCapacityResult {
  const result = runAutoPackPanels(
    context,
    panelTypeId,
    alignmentAngleDegrees,
    Number.POSITIVE_INFINITY,
    options.solarHeatmap
  );

  return {
    ...result,
    panelCount: result.panels.length,
  };
}
