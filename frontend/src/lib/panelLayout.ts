import {
  area as turfArea,
  bbox as turfBbox,
  booleanContains,
  booleanDisjoint,
  booleanIntersects,
  buffer as turfBuffer,
  destination,
  point,
  polygon,
} from "@turf/turf";
import { Coordinates, PanelLayoutContext, PanelTypeDefinition, PanelTypeId, RoofElement } from "@/types";

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

const GRID_OFFSETS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.5, 0],
  [0, 0.5],
  [0.5, 0.5],
];

const DISTANCE_UNITS_KM = "kilometers";
const BUFFER_UNITS_M = "meters";
const EPSILON = 1e-9;

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

function createPanelFromSouthWest(
  southWest: [number, number],
  panelTypeId: PanelTypeId
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { widthM, heightM } = PANEL_TYPES[panelTypeId];
  const southWestPoint = point(southWest);
  const southEastPoint = destination(southWestPoint, widthM / 1000, 90, { units: DISTANCE_UNITS_KM });
  const northWestPoint = destination(southWestPoint, heightM / 1000, 0, { units: DISTANCE_UNITS_KM });
  const northEastPoint = destination(southEastPoint, heightM / 1000, 0, { units: DISTANCE_UNITS_KM });
  const southEast = southEastPoint.geometry.coordinates as [number, number];
  const northEast = northEastPoint.geometry.coordinates as [number, number];
  const northWest = northWestPoint.geometry.coordinates as [number, number];

  return polygon(
    [[southWest, southEast, northEast, northWest, southWest]],
    {
      panelTypeId,
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

export function buildPanelLayoutContext(roofElements: RoofElement[], edgeBufferMeters = 0): PanelLayoutContext {
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

  return {
    primaryRoof,
    exclusionZones,
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
  panelTypeId: PanelTypeId
): GeoJSON.Feature<GeoJSON.Polygon> {
  const { widthM, heightM } = PANEL_TYPES[panelTypeId];
  const southCenter = destination(point([center.lng, center.lat]), heightM / 2000, 180, {
    units: DISTANCE_UNITS_KM,
  });
  const northCenter = destination(point([center.lng, center.lat]), heightM / 2000, 0, {
    units: DISTANCE_UNITS_KM,
  });
  const southWest = destination(southCenter, widthM / 2000, 270, {
    units: DISTANCE_UNITS_KM,
  }).geometry.coordinates as [number, number];
  const southEast = destination(southCenter, widthM / 2000, 90, {
    units: DISTANCE_UNITS_KM,
  }).geometry.coordinates as [number, number];
  const northEast = destination(northCenter, widthM / 2000, 90, {
    units: DISTANCE_UNITS_KM,
  }).geometry.coordinates as [number, number];
  const northWest = destination(northCenter, widthM / 2000, 270, {
    units: DISTANCE_UNITS_KM,
  }).geometry.coordinates as [number, number];

  return polygon(
    [[southWest, southEast, northEast, northWest, southWest]],
    {
      panelTypeId,
    }
  );
}

export function autoPackPanels(context: PanelLayoutContext, panelTypeId: PanelTypeId): AutoPackPanelsResult {
  if (!context.primaryRoof) {
    return {
      panels: [],
      attempts: 0,
    };
  }

  const [minLng, minLat, maxLng, maxLat] = turfBbox(context.primaryRoof);
  let bestPanels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

  GRID_OFFSETS.forEach(([xOffsetFactor, yOffsetFactor]) => {
    const { widthM, heightM } = PANEL_TYPES[panelTypeId];
    const offsetOrigin = destination(point([minLng, minLat]), (widthM * xOffsetFactor) / 1000, 90, {
      units: DISTANCE_UNITS_KM,
    });
    const startPoint = destination(offsetOrigin, (heightM * yOffsetFactor) / 1000, 0, {
      units: DISTANCE_UNITS_KM,
    });
    const startLng = startPoint.geometry.coordinates[0];
    let southLat = startPoint.geometry.coordinates[1];
    const candidatePanels: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    while (southLat < maxLat - EPSILON) {
      const rowOrigin = point([startLng, southLat]);
      const northLat = destination(rowOrigin, heightM / 1000, 0, {
        units: DISTANCE_UNITS_KM,
      }).geometry.coordinates[1];

      if (northLat > maxLat + EPSILON) {
        break;
      }

      let westLng = startLng;
      while (westLng < maxLng - EPSILON) {
        const candidatePanel = createPanelFromSouthWest([westLng, southLat], panelTypeId);
        const eastLng = candidatePanel.geometry.coordinates[0][1][0];

        if (eastLng > maxLng + EPSILON) {
          break;
        }

        if (validatePanelPlacement(candidatePanel, context, candidatePanels).isValid) {
          candidatePanels.push(candidatePanel);
        }

        westLng = eastLng;
      }

      southLat = northLat;
    }

    if (candidatePanels.length > bestPanels.length) {
      bestPanels = candidatePanels;
    }
  });

  return {
    panels: bestPanels,
    attempts: GRID_OFFSETS.length,
  };
}
