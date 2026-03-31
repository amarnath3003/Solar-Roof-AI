export type ViewMode = "normal" | "satellite";
export type ElementSource = "manual" | "auto-detected";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export interface SlopeEstimate {
  pitchDegrees: number;
  aspectDegrees: number;
}

export interface RoofElement {
  id: number;
  layerId: number;
  type: string;
  geoJSON: GeoJSON.Feature;
  style: {
    color: string;
  };
  source: ElementSource;
  confidence?: number;
  slope?: SlopeEstimate;
}

export interface ObstacleMarker {
  id: number;
  layerId: number;
  type: "obstacle";
  position: [number, number];
  label: string;
  source: ElementSource;
  confidence?: number;
  estimatedHeightM?: number;
}

export interface DetectionBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface AutoRoofDetectionRequest {
  center: Coordinates;
  bounds: DetectionBounds;
  snapshotBase64: string;
  width: number;
  height: number;
  zoom: number;
  minRoofAreaPx?: number;
  minObstacleAreaPx?: number;
  roofConfidenceThreshold?: number;
  obstacleConfidenceThreshold?: number;
}

export interface AutoDetectedRoofPlane {
  id: string;
  confidence: number;
  estimatedPitchDegrees: number;
  aspectDegrees: number;
  areaSqM: number;
  geometry: GeoJSON.Polygon;
}

export interface AutoDetectedObstacle {
  id: string;
  confidence: number;
  obstacleType: string;
  estimatedHeightM: number;
  geometry: GeoJSON.Point;
}

export interface AutoDetectionMetadata {
  processingMs: number;
  roofCandidates: number;
  obstacleCandidates: number;
  filteredRoofPlanes: number;
  filteredObstacles: number;
  model: string;
  imageQuality: number;
  inputWidth: number;
  inputHeight: number;
  warningCodes: string[];
  warnings: string[];
  estimatedMetrics: string[];
}

export interface AutoRoofDetectionResult {
  roofPlanes: AutoDetectedRoofPlane[];
  obstacles: AutoDetectedObstacle[];
  metadata: AutoDetectionMetadata;
}
