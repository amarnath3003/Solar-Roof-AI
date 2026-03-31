import { useCallback, useState } from "react";
import { AutoRoofDetectionRequest, AutoRoofDetectionResult } from "@/types";

type BackendRoofPlane = {
  id: string;
  confidence: number;
  estimated_pitch_degrees: number;
  aspect_degrees: number;
  area_sq_m: number;
  geometry: GeoJSON.Polygon;
};

type BackendObstacle = {
  id: string;
  confidence: number;
  obstacle_type: string;
  estimated_height_m: number;
  geometry: GeoJSON.Point;
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

type BackendError = {
  detail?: string;
};

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8000";

function toErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return `Cannot reach detection backend at ${API_BASE_URL}. Start backend and try again.`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Detection request failed.";
}

function mapDetectionResponse(payload: BackendDetectionResponse): AutoRoofDetectionResult {
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
      filteredRoofPlanes: payload.metadata.filtered_roof_planes ?? payload.roof_planes.length,
      filteredObstacles: payload.metadata.filtered_obstacles ?? payload.obstacles.length,
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

export function useAutoRoofDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectFromSnapshot = useCallback(async (request: AutoRoofDetectionRequest) => {
    setIsDetecting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/roof/detect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          center: request.center,
          bounds: request.bounds,
          snapshot_base64: request.snapshotBase64,
          width: request.width,
          height: request.height,
          zoom: request.zoom,
          min_roof_area_px: request.minRoofAreaPx,
          min_obstacle_area_px: request.minObstacleAreaPx,
          roof_confidence_threshold: request.roofConfidenceThreshold,
          obstacle_confidence_threshold: request.obstacleConfidenceThreshold,
        }),
      });

      if (!response.ok) {
        const backendError = (await response.json().catch(() => ({}))) as BackendError;
        throw new Error(backendError.detail ?? "Detection request failed.");
      }

      const payload = (await response.json()) as BackendDetectionResponse;
      return mapDetectionResponse(payload);
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
