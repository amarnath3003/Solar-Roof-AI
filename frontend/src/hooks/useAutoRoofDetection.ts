import { useCallback, useState } from "react";
import { AutoRoofDetectionRequest, AutoRoofDetectionResult } from "@/types";

type RoboflowPredictions = {
  type?: string;
  value?: string;
};

type RoboflowWorkflowFrame = {
  predictions?: RoboflowPredictions;
  json_output?: unknown;
  svg_output?: string;
  svg?: string;
  outputs?: Array<{
    predictions?: RoboflowPredictions;
    json_output?: unknown;
    svg_output?: string;
    svg?: string;
  }>;
};

type RoboflowWorkflowResponse = RoboflowWorkflowFrame[] | RoboflowWorkflowFrame;

type RoboflowJsonPolygon = {
  points?: unknown;
  confidence?: unknown;
  label?: unknown;
};

type RoboflowJsonOutput = {
  polygons?: RoboflowJsonPolygon[];
};

type RoboflowError = {
  error?: string;
  message?: string;
  detail?: string;
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
const ROBOFLOW_WORKFLOW_URL = import.meta.env.VITE_ROBOFLOW_WORKFLOW_URL;
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

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parsePointPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const x = parseNumber(value[0]);
  const y = parseNumber(value[1]);
  if (x == null || y == null) return null;
  return [x, y];
}

function pointsFromUnknown(value: unknown): Array<[number, number]> {
  if (!Array.isArray(value)) return [];

  const points: Array<[number, number]> = [];
  for (const entry of value) {
    if (Array.isArray(entry) && entry.length >= 2) {
      const x = parseNumber(entry[0]);
      const y = parseNumber(entry[1]);
      if (x != null && y != null) points.push([x, y]);
      continue;
    }

    if (entry && typeof entry === "object") {
      const x = parseNumber((entry as Record<string, unknown>).x);
      const y = parseNumber((entry as Record<string, unknown>).y);
      if (x != null && y != null) points.push([x, y]);
    }
  }

  return points;
}

function firstNonEmptyPoints(candidates: Array<Array<[number, number]>>): Array<[number, number]> {
  for (const points of candidates) {
    if (points.length > 0) return points;
  }
  return [];
}

function toShapeCandidate(record: Record<string, unknown>): SvgShapeCandidate | null {
  const points = firstNonEmptyPoints([
    pointsFromUnknown(record.points),
    pointsFromUnknown(record.polygon),
    pointsFromUnknown(record.vertices),
    pointsFromUnknown(record.corners),
  ]);

  let shapePoints = points;
  if (shapePoints.length < 3) {
    const x = parseNumber(record.x);
    const y = parseNumber(record.y);
    const width = parseNumber(record.width);
    const height = parseNumber(record.height);
    if (x != null && y != null && width != null && height != null && width > 0 && height > 0) {
      shapePoints = [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height],
      ];
    }
  }

  if (shapePoints.length < 3) return null;

  const areaPx = polygonArea(shapePoints);
  if (areaPx <= 0) return null;

  const confidence =
    parseNumber(record.confidence) ??
    parseNumber(record.score) ??
    parseNumber(record.probability) ??
    parseNumber(record["data-confidence"]);

  const label = [record.class, record.label, record.name, record.id]
    .map((value) => (typeof value === "string" ? value : ""))
    .filter(Boolean)
    .join(" ")
    .trim()
    .toLowerCase();

  return {
    points: shapePoints,
    areaPx,
    confidence,
    label,
  };
}

function collectCandidatesFromJson(value: unknown, out: SvgShapeCandidate[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCandidatesFromJson(item, out);
    return;
  }

  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  const candidate = toShapeCandidate(record);
  if (candidate) out.push(candidate);

  for (const nested of Object.values(record)) {
    if (nested && (Array.isArray(nested) || typeof nested === "object")) {
      collectCandidatesFromJson(nested, out);
    }
  }
}

function parseJsonShapeCandidates(jsonOutput: unknown): SvgShapeCandidate[] {
  let source: unknown = jsonOutput;

  if (typeof source === "string") {
    const trimmed = source.trim();
    if (!trimmed) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  const candidates: SvgShapeCandidate[] = [];
  collectCandidatesFromJson(source, candidates);
  return candidates;
}

function normalizeRoboflowFrame(payload: RoboflowWorkflowResponse): RoboflowWorkflowFrame | null {
  if (Array.isArray(payload)) return payload[0] ?? null;
  if (payload && typeof payload === "object") return payload;
  return null;
}

function getFrameSvgMarkup(frame: RoboflowWorkflowFrame): string | undefined {
  const topLevel = frame.svg_output ?? frame.svg;
  if (topLevel) return topLevel;
  const firstOutput = frame.outputs?.[0];
  return firstOutput?.svg_output ?? firstOutput?.svg;
}

function getFrameJsonOutput(frame: RoboflowWorkflowFrame): unknown {
  if (frame.json_output != null) return frame.json_output;
  return frame.outputs?.[0]?.json_output;
}

function getFramePredictions(frame: RoboflowWorkflowFrame): RoboflowPredictions | undefined {
  if (frame.predictions) return frame.predictions;
  return frame.outputs?.[0]?.predictions;
}

function parseRoboflowJsonOutput(jsonOutput: unknown): SvgShapeCandidate[] {
  let parsedOutput: unknown = jsonOutput;

  if (typeof parsedOutput === "string") {
    const trimmed = parsedOutput.trim();
    if (!trimmed) return [];
    try {
      parsedOutput = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }

  if (!parsedOutput || typeof parsedOutput !== "object") {
    return [];
  }

  const output = parsedOutput as RoboflowJsonOutput;
  if (!Array.isArray(output.polygons)) {
    return [];
  }

  const candidates: SvgShapeCandidate[] = [];
  for (const polygon of output.polygons) {
    if (!polygon || typeof polygon !== "object") continue;

    const pointsRaw = (polygon as RoboflowJsonPolygon).points;
    if (!Array.isArray(pointsRaw)) continue;

    const points = pointsRaw
      .map((point) => parsePointPair(point))
      .filter((point): point is [number, number] => point !== null);

    if (points.length < 3) continue;

    const areaPx = polygonArea(points);
    if (areaPx <= 0) continue;

    const confidence = parseNumber((polygon as RoboflowJsonPolygon).confidence);
    const rawLabel = (polygon as RoboflowJsonPolygon).label;
    const label = typeof rawLabel === "string" ? rawLabel.toLowerCase() : "roof";

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
  const frame = normalizeRoboflowFrame(payload);
  if (!frame) {
    throw new Error("Roboflow response was empty.");
  }

  const jsonCandidates = parseRoboflowJsonOutput(getFrameJsonOutput(frame));
  const svgMarkup = getFrameSvgMarkup(frame);
  const svgCandidates = svgMarkup ? parseSvgShapeCandidates(svgMarkup) : [];
  const candidates = jsonCandidates.length > 0 ? jsonCandidates : svgCandidates;
  const hasGeometryCandidates = candidates.length > 0;
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

  if (!hasGeometryCandidates) {
    warningCodes.push("NO_GEOMETRY_OUTPUT");
    warnings.push("Roboflow returned a valid response but no polygon geometry was produced.");
  }

  const elapsedMs = Math.max(0, Math.round(performance.now() - started));
  const predictions = getFramePredictions(frame);

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
      imageQuality: predictions?.value ? 0.75 : 0.5,
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

function withApiKeyQuery(endpoint: string, apiKey: string): string {
  const normalized = endpoint.trim();
  const separator = normalized.includes("?") ? "&" : "?";
  return `${normalized}${separator}api_key=${encodeURIComponent(apiKey)}`;
}

function toDevProxyUrl(absoluteUrl: string): string {
  return `${ROBOFLOW_DEV_PROXY_PREFIX}/${absoluteUrl.replace(/^https?:\/\//, "")}`;
}

function endpointCandidates(): string[] {
  const candidates: string[] = [];

  if (ROBOFLOW_WORKFLOW_URL) {
    candidates.push(import.meta.env.DEV ? toDevProxyUrl(ROBOFLOW_WORKFLOW_URL) : ROBOFLOW_WORKFLOW_URL);

    if (/\/workflow\//.test(ROBOFLOW_WORKFLOW_URL)) {
      const alternate = ROBOFLOW_WORKFLOW_URL.replace(/\/workflow\//, "/workflows/");
      candidates.push(import.meta.env.DEV ? toDevProxyUrl(alternate) : alternate);
    }
  }

  if (ROBOFLOW_API_URL && ROBOFLOW_WORKSPACE && ROBOFLOW_WORKFLOW_ID) {
    const serverless = `${ROBOFLOW_API_URL.replace(/\/$/, "")}/${ROBOFLOW_WORKSPACE}/workflows/${ROBOFLOW_WORKFLOW_ID}`;
    candidates.push(import.meta.env.DEV ? toDevProxyUrl(serverless) : serverless);
  }

  // De-duplicate while preserving order.
  return [...new Set(candidates)];
}

export function useAutoRoofDetection() {
  const [isDetecting, setIsDetecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectFromSnapshot = useCallback(async (request: AutoRoofDetectionRequest) => {
    setIsDetecting(true);
    setError(null);

    try {
      if (!ROBOFLOW_WORKFLOW_URL && (!ROBOFLOW_WORKSPACE || !ROBOFLOW_WORKFLOW_ID)) {
        throw new Error(
          "Roboflow config missing. Set VITE_ROBOFLOW_WORKSPACE and VITE_ROBOFLOW_WORKFLOW_ID, or set VITE_ROBOFLOW_WORKFLOW_URL."
        );
      }

      if (!import.meta.env.DEV && !ROBOFLOW_API_URL) {
        throw new Error("Roboflow API URL missing. Set VITE_ROBOFLOW_API_URL.");
      }

      if (!ROBOFLOW_API_KEY) {
        throw new Error("Roboflow key missing. Set VITE_ROBOFLOW_API_KEY.");
      }

      const candidates = endpointCandidates();
      if (candidates.length === 0) {
        throw new Error("No Roboflow endpoint candidates were generated from env config.");
      }

      let lastError: string | null = null;
      for (const endpoint of candidates) {
        const endpointWithApiKey = withApiKeyQuery(endpoint, ROBOFLOW_API_KEY);
        const response = await fetch(endpointWithApiKey, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ROBOFLOW_API_KEY,
          },
          body: JSON.stringify({
            api_key: ROBOFLOW_API_KEY,
            inputs: {
              image: toRoboflowImageInput(request.snapshotBase64),
            },
          }),
        });

        if (response.ok) {
          const payload = (await response.json()) as RoboflowWorkflowResponse;
          return mapRoboflowResponse(payload, request);
        }

        const roboflowError = (await response.json().catch(() => ({}))) as RoboflowError;
        lastError =
          roboflowError.error ??
          roboflowError.message ??
          roboflowError.detail ??
          `Roboflow request failed (${response.status}).`;

        // Retry on likely endpoint mismatch; stop early for definite auth failure and rate limits.
        if ([401, 429].includes(response.status)) {
          break;
        }
      }

      throw new Error(lastError ?? "Roboflow detection request failed.");
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
