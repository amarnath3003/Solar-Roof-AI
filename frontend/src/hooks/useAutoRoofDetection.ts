import { useCallback, useState } from "react";
import { AutoRoofDetectionRequest, AutoRoofDetectionResult } from "@/types";

type RoboflowPredictions = {
  type?: string;
  value?: string;
};

type RoboflowWorkflowFrame = {
  predictions?: RoboflowPredictions;
  json_output?: string;
  svg_output?: string;
};

type RoboflowWorkflowResponse = RoboflowWorkflowFrame[];

type RoboflowError = {
  error?: string;
  message?: string;
};

type SvgShapeCandidate = {
  points: Array<[number, number]>;
  areaPx: number;
  confidence: number | null;
  label: string;
};

type PixelToGeoContext = {
  width: number;
  height: number;
  west: number;
  south: number;
  east: number;
  north: number;
};

const ROBOFLOW_API_URL = import.meta.env.VITE_ROBOFLOW_API_URL;
const ROBOFLOW_WORKSPACE = import.meta.env.VITE_ROBOFLOW_WORKSPACE;
const ROBOFLOW_WORKFLOW_ID = import.meta.env.VITE_ROBOFLOW_WORKFLOW_ID;
const ROBOFLOW_API_KEY = import.meta.env.VITE_ROBOFLOW_API_KEY;
const ROBOFLOW_DEV_PROXY_PREFIX = "/roboflow-proxy";

function getMinRoofAreaPx(request: AutoRoofDetectionRequest): number {
  return Math.max(50, request.minRoofAreaPx ?? 500);
}

function getMinObstacleAreaPx(request: AutoRoofDetectionRequest): number {
  return Math.max(5, request.minObstacleAreaPx ?? 35);
}

function getRoofConfidenceThreshold(request: AutoRoofDetectionRequest): number {
  return Math.max(0, Math.min(1, request.roofConfidenceThreshold ?? 0.4));
}

function getObstacleConfidenceThreshold(request: AutoRoofDetectionRequest): number {
  return Math.max(0, Math.min(1, request.obstacleConfidenceThreshold ?? 0.45));
}

function removeDataUrlPrefix(value: string): string {
  if (!value.includes(",")) return value;
  return value.split(",", 2)[1] ?? value;
}

function toRoboflowImageInput(snapshotBase64: string): { type: "base64" | "url"; value: string } {
  if (/^https?:\/\//i.test(snapshotBase64)) {
    return { type: "url", value: snapshotBase64 };
  }

  return {
    type: "base64",
    value: removeDataUrlPrefix(snapshotBase64),
  };
}

function pixelToGeo(point: [number, number], ctx: PixelToGeoContext): [number, number] {
  const [x, y] = point;
  const lng = ctx.west + (x / Math.max(ctx.width, 1)) * (ctx.east - ctx.west);
  const lat = ctx.north - (y / Math.max(ctx.height, 1)) * (ctx.north - ctx.south);
  return [lng, lat];
}

function polygonArea(points: Array<[number, number]>): number {
  if (points.length < 3) return 0;

  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

function polygonCentroid(points: Array<[number, number]>): [number, number] | null {
  if (points.length < 3) return null;

  let areaFactor = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const cross = x1 * y2 - x2 * y1;
    areaFactor += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }

  if (Math.abs(areaFactor) < 1e-9) return null;

  const area = areaFactor * 0.5;
  return [cx / (6 * area), cy / (6 * area)];
}

function centerPrior(centroid: [number, number], width: number, height: number): number {
  const cx = width / 2;
  const cy = height / 2;
  const dist = Math.hypot(centroid[0] - cx, centroid[1] - cy);
  const normDist = dist / Math.max(Math.hypot(width, height), 1);
  const sigma = 0.22;
  return Math.exp(-((normDist * normDist) / (2 * sigma * sigma)));
}

function estimateAspectDegrees(points: Array<[number, number]>): number {
  if (points.length < 2) return 0;

  let longest = 0;
  let angle = 0;

  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len <= longest) continue;
    longest = len;
    angle = (Math.atan2(-(y2 - y1), x2 - x1) * (180 / Math.PI) + 360) % 360;
  }

  return Number(angle.toFixed(2));
}

function areaPxToSqM(areaPx: number, request: AutoRoofDetectionRequest): number {
  const widthMetersApprox = Math.max(1e-6, Math.abs(request.bounds.east - request.bounds.west) * 111_320);
  const heightMetersApprox = Math.max(1e-6, Math.abs(request.bounds.north - request.bounds.south) * 110_540);
  const pxToMeterX = widthMetersApprox / Math.max(1, request.width);
  const pxToMeterY = heightMetersApprox / Math.max(1, request.height);
  return Math.max(0, areaPx) * pxToMeterX * pxToMeterY;
}

function parseOptionalFloat(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseSvgPoints(value: string): Array<[number, number]> {
  const numbers = value.match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g) ?? [];
  if (numbers.length < 6) return [];
  const points: Array<[number, number]> = [];

  for (let index = 0; index < numbers.length - 1; index += 2) {
    const x = Number(numbers[index]);
    const y = Number(numbers[index + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push([x, y]);
  }

  return points;
}

function parseSvgShapeCandidates(svgMarkup: string): SvgShapeCandidate[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, "image/svg+xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Roboflow returned invalid SVG output.");
  }

  const elements = Array.from(doc.querySelectorAll("polygon, polyline, rect, path"));
  const candidates: SvgShapeCandidate[] = [];

  for (const element of elements) {
    const tag = element.tagName.toLowerCase();
    let points: Array<[number, number]> = [];

    if (tag === "polygon" || tag === "polyline") {
      points = parseSvgPoints(element.getAttribute("points") ?? "");
    } else if (tag === "rect") {
      const x = parseOptionalFloat(element.getAttribute("x")) ?? 0;
      const y = parseOptionalFloat(element.getAttribute("y")) ?? 0;
      const width = parseOptionalFloat(element.getAttribute("width")) ?? 0;
      const height = parseOptionalFloat(element.getAttribute("height")) ?? 0;
      if (width > 0 && height > 0) {
        points = [
          [x, y],
          [x + width, y],
          [x + width, y + height],
          [x, y + height],
        ];
      }
    } else if (tag === "path") {
      points = parseSvgPoints(element.getAttribute("d") ?? "");
    }

    if (points.length < 3) continue;
    const areaPx = polygonArea(points);
    if (areaPx <= 0) continue;

    const label = ["class", "id", "label", "data-label", "name"]
      .map((key) => element.getAttribute(key) ?? "")
      .filter(Boolean)
      .join(" ")
      .trim()
      .toLowerCase();

    let confidence: number | null = null;
    for (const key of ["confidence", "score", "probability", "data-confidence", "data-score"]) {
      confidence = parseOptionalFloat(element.getAttribute(key));
      if (confidence != null) break;
    }

    candidates.push({
      points,
      areaPx,
      confidence,
      label,
    });
  }

  return candidates;
}

function mapRoboflowResponse(payload: RoboflowWorkflowResponse, request: AutoRoofDetectionRequest): AutoRoofDetectionResult {
  const started = performance.now();
  const frame = payload[0];
  if (!frame || !frame.svg_output) {
    throw new Error("Roboflow response did not include svg_output.");
  }

  const candidates = parseSvgShapeCandidates(frame.svg_output);
  const minRoofAreaPx = getMinRoofAreaPx(request);
  const minObstacleAreaPx = getMinObstacleAreaPx(request);
  const roofConfidenceThreshold = getRoofConfidenceThreshold(request);
  const obstacleConfidenceThreshold = getObstacleConfidenceThreshold(request);
  const maxRoofPlanes = 12;
  const maxObstacles = 40;

  const ctx: PixelToGeoContext = {
    width: request.width,
    height: request.height,
    west: request.bounds.west,
    south: request.bounds.south,
    east: request.bounds.east,
    north: request.bounds.north,
  };

  const roofCandidates: Array<{ plane: AutoRoofDetectionResult["roofPlanes"][number]; score: number }> = [];
  const obstacleCandidates: Array<{ obstacle: AutoRoofDetectionResult["obstacles"][number]; score: number }> = [];
  let roofCandidateCount = 0;
  let obstacleCandidateCount = 0;

  for (const [index, candidate] of candidates.entries()) {
    const label = candidate.label;
    const isObstacleLabeled = ["obstacle", "chimney", "vent", "hvac"].some((keyword) => label.includes(keyword));
    const isRoofLabeled = ["roof", "plane", "surface"].some((keyword) => label.includes(keyword));
    const inferredObstacle = isObstacleLabeled || (!isRoofLabeled && candidate.areaPx <= minRoofAreaPx * 0.4);

    const centroid = polygonCentroid(candidate.points);
    if (!centroid) continue;

    const prior = centerPrior(centroid, request.width, request.height);
    const seedConfidence = candidate.confidence ?? (inferredObstacle ? 0.62 : 0.78);
    const confidence = Math.max(0, Math.min(1, seedConfidence * 0.72 + prior * 0.28));

    if (inferredObstacle) {
      obstacleCandidateCount += 1;
      if (candidate.areaPx < minObstacleAreaPx || candidate.areaPx > minRoofAreaPx * 0.55) continue;
      if (confidence < obstacleConfidenceThreshold) continue;

      obstacleCandidates.push({
        obstacle: {
          id: `obstacle_${index + 1}`,
          confidence: Number(confidence.toFixed(3)),
          obstacleType: "rooftop-obstacle",
          estimatedHeightM: Number(Math.max(0.3, Math.min(4.5, Math.sqrt(candidate.areaPx) / 9)).toFixed(2)),
          geometry: {
            type: "Point",
            coordinates: pixelToGeo(centroid, ctx),
          },
        },
        score: confidence,
      });
      continue;
    }

    roofCandidateCount += 1;
    if (candidate.areaPx < minRoofAreaPx) continue;
    if (confidence < roofConfidenceThreshold) continue;

    const ring = candidate.points.map((point) => pixelToGeo(point, ctx));
    if (ring.length < 4) continue;
    ring.push(ring[0]);

    roofCandidates.push({
      plane: {
        id: `roof_${index + 1}`,
        confidence: Number(confidence.toFixed(3)),
        estimatedPitchDegrees: Number((8 + (1 - prior) * 10).toFixed(2)),
        aspectDegrees: estimateAspectDegrees(candidate.points),
        areaSqM: Number(areaPxToSqM(candidate.areaPx, request).toFixed(2)),
        geometry: {
          type: "Polygon",
          coordinates: [ring],
        },
      },
      score: confidence,
    });
  }

  roofCandidates.sort((a, b) => b.score - a.score);
  obstacleCandidates.sort((a, b) => b.score - a.score);

  const roofPlanes = roofCandidates.slice(0, maxRoofPlanes).map((entry) => entry.plane);
  const obstacles = obstacleCandidates.slice(0, maxObstacles).map((entry) => entry.obstacle);

  const warningCodes: string[] = [];
  const warnings: string[] = [];

  if (roofCandidateCount > maxRoofPlanes) {
    warningCodes.push("TRUNCATED_ROOF_PLANES");
    warnings.push("Roof detections were truncated by max_roof_planes.");
  }

  if (obstacleCandidateCount > maxObstacles) {
    warningCodes.push("TRUNCATED_OBSTACLES");
    warnings.push("Obstacle detections were truncated by max_obstacles.");
  }

  if (roofCandidateCount > 0 && roofPlanes.length === 0) {
    warningCodes.push("FILTERED_ROOF_CANDIDATES");
    warnings.push("Roof candidates were detected but filtered by quality thresholds.");
  }

  if (obstacleCandidateCount > 0 && obstacles.length === 0) {
    warningCodes.push("FILTERED_OBSTACLE_CANDIDATES");
    warnings.push("Obstacle candidates were detected but filtered by quality thresholds.");
  }

  if (roofPlanes.length === 0) {
    warningCodes.push("NO_ROOF_PLANES");
    warnings.push("No high-confidence roof planes found. Try zooming in and rerun detection.");
  }

  const elapsedMs = Math.max(0, Math.round(performance.now() - started));

  return {
    roofPlanes,
    obstacles,
    metadata: {
      processingMs: elapsedMs,
      roofCandidates: roofCandidateCount,
      obstacleCandidates: obstacleCandidateCount,
      filteredRoofPlanes: roofPlanes.length,
      filteredObstacles: obstacles.length,
      model: `roboflow-workflow:${ROBOFLOW_WORKSPACE}/${ROBOFLOW_WORKFLOW_ID}`,
      imageQuality: frame.predictions?.value ? 0.75 : 0.5,
      inputWidth: request.width,
      inputHeight: request.height,
      warningCodes,
      warnings,
      estimatedMetrics: ["estimatedPitchDegrees", "aspectDegrees", "estimatedHeightM"],
    },
  };
}

function toErrorMessage(error: unknown): string {
  if (error instanceof TypeError) {
    return import.meta.env.DEV
      ? "Cannot reach Roboflow workflow. Restart the dev server and verify Vite proxy is active."
      : "Cannot reach Roboflow hosted workflow. Check network, API URL, and CORS access.";
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
      if (!ROBOFLOW_WORKSPACE || !ROBOFLOW_WORKFLOW_ID) {
        throw new Error(
          "Roboflow config missing. Set VITE_ROBOFLOW_WORKSPACE and VITE_ROBOFLOW_WORKFLOW_ID."
        );
      }

      if (!import.meta.env.DEV && !ROBOFLOW_API_URL) {
        throw new Error("Roboflow API URL missing. Set VITE_ROBOFLOW_API_URL.");
      }

      if (!ROBOFLOW_API_KEY) {
        throw new Error("Roboflow key missing. Set VITE_ROBOFLOW_API_KEY.");
      }

      const endpointBase = import.meta.env.DEV
        ? ROBOFLOW_DEV_PROXY_PREFIX
        : (ROBOFLOW_API_URL as string).replace(/\/$/, "");
      const endpoint = `${endpointBase}/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW_ID}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          api_key: ROBOFLOW_API_KEY,
          inputs: {
            image: toRoboflowImageInput(request.snapshotBase64),
          },
        }),
      });

      if (!response.ok) {
        const roboflowError = (await response.json().catch(() => ({}))) as RoboflowError;
        throw new Error(roboflowError.error ?? roboflowError.message ?? "Roboflow detection request failed.");
      }

      const payload = (await response.json()) as RoboflowWorkflowResponse;
      return mapRoboflowResponse(payload, request);
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
