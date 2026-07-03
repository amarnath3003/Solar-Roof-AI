import { useCallback, useState } from "react";
import { AutoRoofDetectionRequest, AutoRoofDetectionResult } from "@/types";

/**
 * Roof detection now runs against our own backend ML model
 * (POST /api/v1/roof/detect) instead of the external Roboflow workflow.
 * The API key is gone from the browser and no third-party service is called.
 *
 * Set VITE_BACKEND_URL to point at the backend (defaults to localhost:8000 for
 * local dev). The backend returns a geo-referenced DetectionResponse whose roof
 * outlines are already straightened into vector-like polygons.
 */

const BACKEND_URL = (import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
const DETECT_ENDPOINT = `${BACKEND_URL}/api/v1/roof/detect`;

type BackendPolygon = { type: "Polygon"; coordinates: number[][][] };
type BackendPoint = { type: "Point"; coordinates: number[] };

type BackendRoofPlane = {
  id: string;
  confidence: number;
  estimated_pitch_degrees: number;
  aspect_degrees: number;
  area_sq_m: number;
  geometry: BackendPolygon;
};

type BackendObstacle = {
  id: string;
  confidence: number;
  obstacle_type: string;
  estimated_height_m: number;
  geometry: BackendPoint;
};

type BackendMetadata = {
  processing_ms: number;
  roof_candidates: number;
  obstacle_candidates: number;
  filtered_roof_planes: number;
  filtered_obstacles: number;
  model: string;
  image_quality: number;
  input_width: number;
  input_height: number;
  warning_codes: string[];
  warnings: string[];
  estimated_metrics: string[];
};

type BackendDetectionResponse = {
  roof_planes: BackendRoofPlane[];
  obstacles: BackendObstacle[];
  metadata: BackendMetadata;
};

function removeDataUrlPrefix(value: string): string {
  if (!value.includes(",")) return value;
  return value.split(",", 2)[1] ?? value;
}

function toBackendRequest(request: AutoRoofDetectionRequest) {
  const minRoofAreaPx = Math.max(50, request.minRoofAreaPx ?? 500);
  const minObstacleAreaPx = Math.min(
    minRoofAreaPx - 1,
    Math.max(5, request.minObstacleAreaPx ?? 35)
  );

  return {
    center: { lat: request.center.lat, lng: request.center.lng },
    bounds: {
      west: request.bounds.west,
      south: request.bounds.south,
      east: request.bounds.east,
      north: request.bounds.north,
    },
    snapshot_base64: removeDataUrlPrefix(request.snapshotBase64),
    width: request.width,
    height: request.height,
    zoom: request.zoom,
    min_roof_area_px: minRoofAreaPx,
    min_obstacle_area_px: minObstacleAreaPx,
    roof_confidence_threshold: Math.max(0, Math.min(1, request.roofConfidenceThreshold ?? 0.4)),
    obstacle_confidence_threshold: Math.max(0, Math.min(1, request.obstacleConfidenceThreshold ?? 0.45)),
  };
}

function mapBackendResponse(payload: BackendDetectionResponse): AutoRoofDetectionResult {
  return {
    roofPlanes: payload.roof_planes.map((plane) => ({
      id: plane.id,
      confidence: plane.confidence,
      estimatedPitchDegrees: plane.estimated_pitch_degrees,
      aspectDegrees: plane.aspect_degrees,
      areaSqM: plane.area_sq_m,
      geometry: plane.geometry,
    })),
    obstacles: payload.obstacles.map((obstacle) => ({
      id: obstacle.id,
      confidence: obstacle.confidence,
      obstacleType: obstacle.obstacle_type,
      estimatedHeightM: obstacle.estimated_height_m,
      geometry: obstacle.geometry,
    })),
    metadata: {
      processingMs: payload.metadata.processing_ms,
      roofCandidates: payload.metadata.roof_candidates,
      obstacleCandidates: payload.metadata.obstacle_candidates,
      filteredRoofPlanes: payload.metadata.filtered_roof_planes,
      filteredObstacles: payload.metadata.filtered_obstacles,
      model: payload.metadata.model,
      imageQuality: payload.metadata.image_quality,
      inputWidth: payload.metadata.input_width,
      inputHeight: payload.metadata.input_height,
      warningCodes: payload.metadata.warning_codes ?? [],
      warnings: payload.metadata.warnings ?? [],
      estimatedMetrics: payload.metadata.estimated_metrics ?? [],
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return `Cannot reach the roof detection backend at ${BACKEND_URL}. Start it with "python -m uvicorn app.main:app" (see backend/README.md) or set VITE_BACKEND_URL.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Detection request failed.";
}

export function useAutoRoofDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectFromSnapshot = useCallback(async (request: AutoRoofDetectionRequest) => {
    setIsDetecting(true);
    setError(null);

    try {
      const response = await fetch(DETECT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toBackendRequest(request)),
      });

      if (!response.ok) {
        const detail = await response
          .json()
          .then((body: { detail?: string }) => body.detail)
          .catch(() => null);
        throw new Error(detail ?? `Roof detection failed (${response.status}).`);
      }

      const payload = (await response.json()) as BackendDetectionResponse;
      return mapBackendResponse(payload);
    } catch (requestError) {
      const message = toErrorMessage(requestError);
      setError(message);
      throw new Error(message);
    } finally {
      setIsDetecting(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    detectFromSnapshot,
    isDetecting,
    error,
    clearError,
  };
}
