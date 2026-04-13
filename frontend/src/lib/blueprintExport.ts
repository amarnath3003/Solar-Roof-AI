import html2canvas from "html2canvas";
import type { jsPDF } from "jspdf";
import type { Map as LeafletMap } from "leaflet";
import type { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import type { SolarHeatmap } from "@/lib/solarHeatmap";
import { captureMapSnapshot } from "@/lib/mapSnapshot";
import type {
  Coordinates,
  ObstacleMarker,
  PanelLayoutContext,
  PanelLayoutMode,
  PanelTypeId,
  PlacedPanel,
  RoofAreaSummary,
  RoofElement,
} from "@/types";
import { PANEL_TYPES } from "@/lib/panelLayout";

const PAGE_MARGIN = 34;

type ExportBlueprintReportInput = {
  address: string;
  coordinates: Coordinates | null;
  mapContainer: HTMLDivElement;
  leafletMap: LeafletMap | null;
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  placedPanels: PlacedPanel[];
  panelLayoutContext: PanelLayoutContext;
  panelLayoutMode: PanelLayoutMode;
  panelTypeId: PanelTypeId;
  roofAreaSummary: RoofAreaSummary | null;
  plannerInputs: SolarFinancialInputs;
  plannerFinancials: SolarFinancialResults;
  plannerSyncMessage: string;
  panelLayoutMessage: string | null;
  solarHeatmap: SolarHeatmap | null;
  downloadJson?: boolean;
};

type ExportBlueprintReportResult = {
  pdfFileName: string;
  jsonFileName: string;
};

type CapturedBlueprintImage = {
  dataUrl: string;
  width: number;
  height: number;
};

type MetricItem = {
  label: string;
  value: string;
};

type StrokeStyle = {
  stroke: string;
  width: number;
  dash?: number[];
};

type FillStrokeStyle = {
  fill?: string;
  stroke?: string;
  width?: number;
  dash?: number[];
};

type ScreenPoint = {
  x: number;
  y: number;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatPercent(value: number, maximumFractionDigits = 1) {
  return `${formatNumber(value, maximumFractionDigits)}%`;
}

function formatCompactMoney(value: number) {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absolute >= 1_000_000) {
    return `${sign}$${formatNumber(absolute / 1_000_000, 1)}M`;
  }

  if (absolute >= 1_000) {
    return `${sign}$${formatNumber(absolute / 1_000, 1)}K`;
  }

  return `${sign}$${formatNumber(absolute, 0)}`;
}

function sanitizeFileSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 60);
}

function timestampForFile(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  const second = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function requestAnimationFrameAsync() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);

    promise
      .then((value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      });
  });
}

function getBlueprintGridMajorSpacing(zoomLevel: number) {
  const baseZoom = 19;
  const baseSpacingPx = 48;
  const spacing = baseSpacingPx * Math.pow(2, zoomLevel - baseZoom);
  return Math.max(12, Math.min(320, spacing));
}

function drawGridLineSet(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  spacing: number
) {
  context.beginPath();

  for (let x = centerX; x <= width + spacing; x += spacing) {
    const snappedX = Math.round(x) + 0.5;
    context.moveTo(snappedX, 0);
    context.lineTo(snappedX, height);
  }

  for (let x = centerX - spacing; x >= -spacing; x -= spacing) {
    const snappedX = Math.round(x) + 0.5;
    context.moveTo(snappedX, 0);
    context.lineTo(snappedX, height);
  }

  for (let y = centerY; y <= height + spacing; y += spacing) {
    const snappedY = Math.round(y) + 0.5;
    context.moveTo(0, snappedY);
    context.lineTo(width, snappedY);
  }

  for (let y = centerY - spacing; y >= -spacing; y -= spacing) {
    const snappedY = Math.round(y) + 0.5;
    context.moveTo(0, snappedY);
    context.lineTo(width, snappedY);
  }

  context.stroke();
}

function drawBlueprintBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoomLevel: number
) {
  context.fillStyle = "#07111f";
  context.fillRect(0, 0, width, height);

  const majorSpacing = getBlueprintGridMajorSpacing(zoomLevel);
  const minorSpacing = Math.max(majorSpacing / 4, 6);
  const centerX = width / 2;
  const centerY = height / 2;

  context.lineWidth = 1;
  context.strokeStyle = "rgba(232, 240, 252, 0.005625)";
  drawGridLineSet(context, width, height, centerX, centerY, minorSpacing);

  context.strokeStyle = "rgba(232, 240, 252, 0.24)";
  drawGridLineSet(context, width, height, centerX, centerY, majorSpacing);
}

function projectLngLat(map: LeafletMap, lngLat: number[]): ScreenPoint | null {
  const [lng, lat] = lngLat;

  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return null;
  }

  const projected = map.latLngToContainerPoint([lat, lng]);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    return null;
  }

  return { x: projected.x, y: projected.y };
}

function traceRingPath(context: CanvasRenderingContext2D, map: LeafletMap, ring: number[][]) {
  let started = false;

  ring.forEach((coordinate) => {
    const point = projectLngLat(map, coordinate);
    if (!point) {
      return;
    }

    if (!started) {
      context.moveTo(point.x, point.y);
      started = true;
      return;
    }

    context.lineTo(point.x, point.y);
  });

  if (started) {
    context.closePath();
  }

  return started;
}

function traceLinePath(context: CanvasRenderingContext2D, map: LeafletMap, line: number[][]) {
  let started = false;

  line.forEach((coordinate) => {
    const point = projectLngLat(map, coordinate);
    if (!point) {
      return;
    }

    if (!started) {
      context.moveTo(point.x, point.y);
      started = true;
      return;
    }

    context.lineTo(point.x, point.y);
  });

  return started;
}

function drawPolygonGeometry(
  context: CanvasRenderingContext2D,
  map: LeafletMap,
  coordinates: number[][][],
  style: FillStrokeStyle
) {
  context.save();
  context.beginPath();

  let hasPath = false;
  coordinates.forEach((ring) => {
    if (traceRingPath(context, map, ring)) {
      hasPath = true;
    }
  });

  if (!hasPath) {
    context.restore();
    return;
  }

  if (style.fill) {
    context.fillStyle = style.fill;
    context.fill("evenodd");
  }

  if (style.stroke) {
    context.strokeStyle = style.stroke;
    context.lineWidth = style.width ?? 1;
    context.setLineDash(style.dash ?? []);
    context.stroke();
  }

  context.restore();
}

function drawLineGeometry(
  context: CanvasRenderingContext2D,
  map: LeafletMap,
  coordinates: number[][],
  style: StrokeStyle
) {
  context.save();
  context.beginPath();
  const hasPath = traceLinePath(context, map, coordinates);
  if (!hasPath) {
    context.restore();
    return;
  }

  context.strokeStyle = style.stroke;
  context.lineWidth = style.width;
  context.setLineDash(style.dash ?? []);
  context.stroke();
  context.restore();
}

function drawGeoFeature(
  context: CanvasRenderingContext2D,
  map: LeafletMap,
  feature: GeoJSON.Feature,
  polygonStyle: FillStrokeStyle,
  lineStyle: StrokeStyle
) {
  const { geometry } = feature;

  if (geometry.type === "Polygon") {
    drawPolygonGeometry(context, map, geometry.coordinates, polygonStyle);
    return;
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygonCoordinates) => {
      drawPolygonGeometry(context, map, polygonCoordinates, polygonStyle);
    });
    return;
  }

  if (geometry.type === "LineString") {
    drawLineGeometry(context, map, geometry.coordinates, lineStyle);
    return;
  }

  if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((lineCoordinates) => {
      drawLineGeometry(context, map, lineCoordinates, lineStyle);
    });
  }
}

function renderLeafletGeometryImage(input: ExportBlueprintReportInput): CapturedBlueprintImage | null {
  if (!input.leafletMap) {
    return null;
  }

  const map = input.leafletMap;
  const mapSize = map.getSize();
  const containerRect = input.mapContainer.getBoundingClientRect();
  const width = Math.max(1, Math.round(mapSize.x || containerRect.width));
  const height = Math.max(1, Math.round(mapSize.y || containerRect.height));
  if (width <= 1 || height <= 1) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  drawBlueprintBackground(context, width, height, map.getZoom());

  if (input.panelLayoutContext.primaryRoof) {
    drawGeoFeature(
      context,
      map,
      input.panelLayoutContext.primaryRoof as GeoJSON.Feature,
      {
        fill: "rgba(34, 197, 94, 0.10)",
        stroke: "rgba(187, 247, 208, 0.85)",
        width: 1.4,
      },
      {
        stroke: "rgba(187, 247, 208, 0.85)",
        width: 1.4,
      }
    );
  }

  input.roofElements.forEach((element) => {
    const roofStroke = element.source === "auto-detected" ? "rgba(34, 211, 238, 0.95)" : "rgba(241, 245, 249, 0.95)";
    drawGeoFeature(
      context,
      map,
      element.geoJSON,
      {
        fill: element.geoJSON.geometry.type.includes("Polygon") ? "rgba(148, 163, 184, 0.10)" : undefined,
        stroke: roofStroke,
        width: element.geoJSON.geometry.type.includes("Line") ? 1.6 : 1.8,
      },
      {
        stroke: roofStroke,
        width: 1.8,
        dash: element.geoJSON.geometry.type.includes("Line") ? [5, 4] : undefined,
      }
    );
  });

  input.panelLayoutContext.exclusionZones.forEach((zone) => {
    drawGeoFeature(
      context,
      map,
      zone as GeoJSON.Feature,
      {
        fill: "rgba(245, 158, 11, 0.20)",
        stroke: "rgba(252, 211, 77, 0.9)",
        width: 1.4,
        dash: [6, 4],
      },
      {
        stroke: "rgba(252, 211, 77, 0.95)",
        width: 1.4,
        dash: [6, 4],
      }
    );
  });

  input.placedPanels.forEach((panel) => {
    drawGeoFeature(
      context,
      map,
      panel.feature as GeoJSON.Feature,
      {
        fill: panel.source === "manual" ? "rgba(59, 130, 246, 0.72)" : "rgba(59, 130, 246, 0.58)",
        stroke: "rgba(219, 234, 254, 0.95)",
        width: 1,
      },
      {
        stroke: "rgba(219, 234, 254, 0.95)",
        width: 1,
      }
    );
  });

  input.obstacleMarkers.forEach((marker) => {
    const point = projectLngLat(map, [marker.position[1], marker.position[0]]);
    if (!point) {
      return;
    }

    context.save();
    context.beginPath();
    context.arc(point.x, point.y, 5.5, 0, Math.PI * 2);
    context.fillStyle = marker.source === "auto-detected" ? "rgba(249, 115, 22, 0.9)" : "rgba(250, 204, 21, 0.9)";
    context.fill();
    context.lineWidth = 1.6;
    context.strokeStyle = "rgba(255, 255, 255, 0.92)";
    context.stroke();
    context.restore();
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

async function captureBlueprintImage(input: ExportBlueprintReportInput): Promise<CapturedBlueprintImage | null> {
  const { mapContainer } = input;
  await requestAnimationFrameAsync();
  await requestAnimationFrameAsync();

  // Prefer deterministic Leaflet geometry rendering for Blueprint exports.
  const geometryImage = renderLeafletGeometryImage(input);
  if (geometryImage) {
    return geometryImage;
  }

  try {
    const snapshot = await withTimeout(
      captureMapSnapshot(mapContainer),
      8_000,
      "Blueprint snapshot timed out while preparing the PDF image."
    );

    return {
      dataUrl: `data:image/png;base64,${snapshot.snapshotBase64}`,
      width: snapshot.width,
      height: snapshot.height,
    };
  } catch {
    // Fallback to html2canvas when tile-based capture cannot compose the viewport.
  }

  try {
    const canvas = await withTimeout(
      html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#07111f",
        logging: false,
        imageTimeout: 6_000,
        scale: 1.1,
      }),
      8_000,
      "Blueprint canvas capture timed out while preparing the PDF image."
    );

    return {
      dataUrl: canvas.toDataURL("image/png"),
      width: canvas.width,
      height: canvas.height,
    };
  } catch {
    return null;
  }
}

function buildFeatureCollection(
  roofElements: RoofElement[],
  obstacleMarkers: ObstacleMarker[],
  placedPanels: PlacedPanel[],
  panelLayoutContext: PanelLayoutContext
): GeoJSON.FeatureCollection {
  const roofFeatures = roofElements.map((element) => {
    return {
      ...element.geoJSON,
      properties: {
        ...(element.geoJSON.properties ?? {}),
        exportEntity: "roof-element",
        elementType: element.type,
        source: element.source,
        confidence: element.confidence ?? null,
        slope: element.slope ?? null,
      },
    } as GeoJSON.Feature;
  });

  const obstacleFeatures = obstacleMarkers.map((marker) => {
    return {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [marker.position[1], marker.position[0]],
      },
      properties: {
        exportEntity: "obstacle",
        source: marker.source,
        label: marker.label,
        confidence: marker.confidence ?? null,
        estimatedHeightM: marker.estimatedHeightM ?? null,
      },
    } as GeoJSON.Feature;
  });

  const panelFeatures = placedPanels.map((panel, index) => {
    return {
      ...panel.feature,
      properties: {
        ...(panel.feature.properties ?? {}),
        exportEntity: "roof-layout-panel",
        panelId: panel.id,
        panelNumber: index + 1,
        source: panel.source,
        panelTypeId: panel.panelTypeId,
      },
    } as GeoJSON.Feature;
  });

  const exclusionZoneFeatures = panelLayoutContext.exclusionZones.map((zone, index) => {
    return {
      ...zone,
      properties: {
        ...(zone.properties ?? {}),
        exportEntity: "exclusion-zone",
        exclusionZoneNumber: index + 1,
      },
    } as GeoJSON.Feature;
  });

  const primaryRoofFeature = panelLayoutContext.primaryRoof
    ? [
        {
          ...panelLayoutContext.primaryRoof,
          properties: {
            ...(panelLayoutContext.primaryRoof.properties ?? {}),
            exportEntity: "primary-roof",
          },
        } as GeoJSON.Feature,
      ]
    : [];

  return {
    type: "FeatureCollection",
    features: [
      ...roofFeatures,
      ...obstacleFeatures,
      ...panelFeatures,
      ...exclusionZoneFeatures,
      ...primaryRoofFeature,
    ],
  };
}

function drawSectionHeading(pdf: jsPDF, text: string, x: number, y: number) {
  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(text, x, y);
}

function drawMetricGrid(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  items: MetricItem[],
  columns = 2
) {
  const columnGap = 10;
  const rowHeight = 42;
  const colWidth = (width - (columns - 1) * columnGap) / columns;

  items.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const boxX = x + column * (colWidth + columnGap);
    const boxY = y + row * rowHeight;

    pdf.setFillColor(244, 247, 251);
    pdf.roundedRect(boxX, boxY, colWidth, rowHeight - 6, 6, 6, "F");

    pdf.setTextColor(71, 85, 105);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(item.label, boxX + 8, boxY + 12);

    pdf.setTextColor(15, 23, 42);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    const valueLines = pdf.splitTextToSize(item.value, colWidth - 16).slice(0, 2);
    pdf.text(valueLines, boxX + 8, boxY + 27);
  });

  return Math.ceil(items.length / columns) * rowHeight;
}

function drawProjectionChart(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  financials: SolarFinancialResults
) {
  const data = financials.financialProjection;

  pdf.setFillColor(248, 250, 252);
  pdf.roundedRect(x, y, width, height, 8, 8, "F");

  if (data.length === 0) {
    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Projection data is unavailable.", x + 10, y + 20);
    return;
  }

  const left = 45;
  const right = 12;
  const top = 16;
  const bottom = 26;
  const plotX = x + left;
  const plotY = y + top;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const years = data.map((point) => point.calendarYear);
  const costs = data.flatMap((point) => [point.costWithSolar, point.costWithoutSolar]);
  const minYear = Math.min(...years);
  const maxYear = Math.max(...years);
  const minCost = Math.min(0, ...costs);
  const maxCost = Math.max(1, ...costs);
  const costSpan = Math.max(1, maxCost - minCost);
  const yearSpan = Math.max(1, maxYear - minYear);

  const toX = (year: number) => plotX + ((year - minYear) / yearSpan) * plotWidth;
  const toY = (cost: number) => plotY + ((maxCost - cost) / costSpan) * plotHeight;

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.5);
  for (let index = 0; index <= 4; index += 1) {
    const ratio = index / 4;
    const gridY = plotY + ratio * plotHeight;
    const value = maxCost - ratio * costSpan;
    pdf.line(plotX, gridY, plotX + plotWidth, gridY);

    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(formatCompactMoney(value), x + 4, gridY + 2);
  }

  const firstYear = data[0].calendarYear;
  const midYear = data[Math.floor(data.length / 2)].calendarYear;
  const lastYear = data[data.length - 1].calendarYear;

  [firstYear, midYear, lastYear].forEach((year) => {
    const axisX = toX(year);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.4);
    pdf.line(axisX, plotY, axisX, plotY + plotHeight);

    pdf.setTextColor(100, 116, 139);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(String(year), axisX - 10, plotY + plotHeight + 12);
  });

  if (financials.breakEvenCalendarYear !== null) {
    const breakEvenX = toX(financials.breakEvenCalendarYear);
    pdf.setDrawColor(16, 185, 129);
    pdf.setLineWidth(1);
    pdf.line(breakEvenX, plotY, breakEvenX, plotY + plotHeight);

    pdf.setTextColor(5, 150, 105);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(8);
    pdf.text("Break-even", breakEvenX + 2, plotY + 10);
  }

  pdf.setDrawColor(37, 99, 235);
  pdf.setLineWidth(1.6);
  for (let index = 1; index < data.length; index += 1) {
    const previous = data[index - 1];
    const current = data[index];
    pdf.line(
      toX(previous.calendarYear),
      toY(previous.costWithSolar),
      toX(current.calendarYear),
      toY(current.costWithSolar)
    );
  }

  pdf.setDrawColor(220, 38, 38);
  pdf.setLineWidth(1.6);
  for (let index = 1; index < data.length; index += 1) {
    const previous = data[index - 1];
    const current = data[index];
    pdf.line(
      toX(previous.calendarYear),
      toY(previous.costWithoutSolar),
      toX(current.calendarYear),
      toY(current.costWithoutSolar)
    );
  }

  const legendY = y + height - 10;
  pdf.setDrawColor(37, 99, 235);
  pdf.setLineWidth(1.6);
  pdf.line(x + 12, legendY, x + 28, legendY);
  pdf.setTextColor(30, 41, 59);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("With solar", x + 31, legendY + 2);

  pdf.setDrawColor(220, 38, 38);
  pdf.setLineWidth(1.6);
  pdf.line(x + 90, legendY, x + 106, legendY);
  pdf.setTextColor(30, 41, 59);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text("Without solar", x + 109, legendY + 2);
}

export async function exportBlueprintPitchReport(
  input: ExportBlueprintReportInput
): Promise<ExportBlueprintReportResult> {
  const now = new Date();
  const generatedAt = now.toISOString();
  const generatedLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(now);
  const trimmedAddress = input.address.trim();
  const reportTitle = trimmedAddress.length > 0 ? trimmedAddress : "Solar Blueprint Report";
  const filePrefix = sanitizeFileSlug(trimmedAddress) || "solar-blueprint";
  const fileTimestamp = timestampForFile(now);
  const jsonFileName = `${filePrefix}-${fileTimestamp}-full-export.json`;
  const pdfFileName = `${filePrefix}-${fileTimestamp}-pitch-report.pdf`;
  const image = await captureBlueprintImage(input);
  const featureCollection = buildFeatureCollection(
    input.roofElements,
    input.obstacleMarkers,
    input.placedPanels,
    input.panelLayoutContext
  );
  const lineGeometryCount = input.roofElements.filter((element) => {
    const geometryType = element.geoJSON.geometry.type;
    return geometryType === "LineString" || geometryType === "MultiLineString" || element.type === "polyline";
  }).length;

  const exportPayload = {
    metadata: {
      generatedAt,
      generatedLabel,
      title: reportTitle,
      address: trimmedAddress,
      coordinates: input.coordinates,
      exportVersion: "1.0",
    },
    geometry: {
      roofElementCount: input.roofElements.length,
      lineGeometryCount,
      obstacleCount: input.obstacleMarkers.length,
      panelCount: input.placedPanels.length,
      exclusionZoneCount: input.panelLayoutContext.exclusionZones.length,
      featureCollection,
    },
    roof: {
      roofAreaSummary: input.roofAreaSummary,
      panelType: PANEL_TYPES[input.panelTypeId],
      panelLayoutMode: input.panelLayoutMode,
      plannerSyncMessage: input.plannerSyncMessage,
      panelLayoutMessage: input.panelLayoutMessage,
    },
    planner: {
      inputs: input.plannerInputs,
      financials: input.plannerFinancials,
      heatmapSummary: input.solarHeatmap
        ? {
            averageExposurePercent: input.solarHeatmap.averageExposurePercent,
            peakExposurePercent: input.solarHeatmap.peakExposurePercent,
            bestZoneLabel: input.solarHeatmap.bestZoneLabel,
          }
        : null,
    },
  };

  if (input.downloadJson) {
    downloadBlob(new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" }), jsonFileName);
  }

  const { jsPDF: PdfConstructor } = await import("jspdf");
  const pdf = new PdfConstructor({
    unit: "pt",
    format: "a4",
    compress: true,
  });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  let cursorY = PAGE_MARGIN;

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY + heightNeeded <= pageHeight - PAGE_MARGIN) {
      return;
    }
    pdf.addPage();
    cursorY = PAGE_MARGIN;
  };

  pdf.setTextColor(15, 23, 42);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  const titleLines = pdf.splitTextToSize(reportTitle, contentWidth);
  pdf.text(titleLines, PAGE_MARGIN, cursorY);
  cursorY += titleLines.length * 24;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`Generated ${generatedLabel}`, PAGE_MARGIN, cursorY);
  cursorY += 14;

  if (input.coordinates) {
    pdf.text(
      `Coordinates: ${formatNumber(input.coordinates.lat, 5)}, ${formatNumber(input.coordinates.lng, 5)}`,
      PAGE_MARGIN,
      cursorY
    );
    cursorY += 14;
  }

  if (image) {
    const imageMaxHeight = 250;
    const imageRatio = image.height > 0 ? image.width / image.height : 1;
    let imageWidth = contentWidth;
    let imageHeight = imageWidth / imageRatio;
    if (imageHeight > imageMaxHeight) {
      imageHeight = imageMaxHeight;
      imageWidth = imageHeight * imageRatio;
    }

    ensureSpace(imageHeight + 24);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(PAGE_MARGIN - 2, cursorY - 2, imageWidth + 4, imageHeight + 4, 8, 8, "S");
    pdf.addImage(image.dataUrl, "PNG", PAGE_MARGIN, cursorY, imageWidth, imageHeight, undefined, "FAST");
    cursorY += imageHeight + 18;
  } else {
    ensureSpace(26);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text("Blueprint image capture unavailable for this export run. Financial and geometry report included below.", PAGE_MARGIN, cursorY);
    cursorY += 18;
  }

  const narrative = `This blueprint proposes a ${input.plannerFinancials.activePanelCount}-panel ${PANEL_TYPES[input.panelTypeId].label.toLowerCase()} system sized at ${formatNumber(input.plannerFinancials.installationSizeKw, 2)} kW. It offsets about ${formatPercent(input.plannerFinancials.energyCoveredDisplayPercent, 1)} of annual demand, with projected 20-year savings of ${formatMoney(input.plannerFinancials.totalTwentyYearSavings)} and break-even ${input.plannerFinancials.breakEvenCalendarYear ?? "outside projection window"}.`;
  const narrativeLines = pdf.splitTextToSize(narrative, contentWidth);
  ensureSpace(narrativeLines.length * 12 + 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);
  pdf.text(narrativeLines, PAGE_MARGIN, cursorY);
  cursorY += narrativeLines.length * 12 + 10;

  ensureSpace(22);
  drawSectionHeading(pdf, "Blueprint And Geometry Summary", PAGE_MARGIN, cursorY);
  cursorY += 14;

  const geometrySummaryMetrics: MetricItem[] = [
    { label: "Roof elements", value: `${input.roofElements.length}` },
    { label: "Line geometries", value: `${lineGeometryCount}` },
    { label: "Obstacle markers", value: `${input.obstacleMarkers.length}` },
    { label: "Placed layout panels", value: `${input.placedPanels.length}` },
    { label: "Exclusion zones", value: `${input.panelLayoutContext.exclusionZones.length}` },
    {
      label: "Usable roof area",
      value: input.roofAreaSummary ? `${formatNumber(input.roofAreaSummary.netSqFt, 0)} sq ft` : "Not calculated",
    },
  ];

  ensureSpace(170);
  cursorY += drawMetricGrid(pdf, PAGE_MARGIN, cursorY, contentWidth, geometrySummaryMetrics, 2);
  cursorY += 8;

  ensureSpace(22);
  drawSectionHeading(pdf, "Financial And System Details", PAGE_MARGIN, cursorY);
  cursorY += 14;

  const financialMetrics: MetricItem[] = [
    { label: "Average monthly bill", value: formatMoney(input.plannerInputs.monthlyBill) },
    { label: "Energy price", value: `${formatMoney(input.plannerInputs.energyCostPerKwh)} per kWh` },
    { label: "Incentive", value: formatMoney(input.plannerInputs.solarIncentiveAmount) },
    { label: "Cost per watt", value: `${formatMoney(input.plannerInputs.costPerWatt)} per W` },
    { label: "System size", value: `${formatNumber(input.plannerFinancials.installationSizeKw, 2)} kW` },
    { label: "Panels", value: `${input.plannerFinancials.activePanelCount}` },
    { label: "Yearly production", value: `${formatNumber(input.plannerFinancials.yearlyEnergyKwh, 0)} kWh` },
    { label: "Energy covered", value: formatPercent(input.plannerFinancials.energyCoveredDisplayPercent, 1) },
    { label: "Gross installation", value: formatMoney(input.plannerFinancials.grossInstallationCost) },
    { label: "Net installation", value: formatMoney(input.plannerFinancials.netInstallationCost) },
    {
      label: "Break-even year",
      value:
        input.plannerFinancials.breakEvenCalendarYear === null
          ? "Not within 20 years"
          : `${input.plannerFinancials.breakEvenCalendarYear}`,
    },
    { label: "20-year savings", value: formatMoney(input.plannerFinancials.totalTwentyYearSavings) },
  ];

  ensureSpace(260);
  cursorY += drawMetricGrid(pdf, PAGE_MARGIN, cursorY, contentWidth, financialMetrics, 2);
  cursorY += 10;

  ensureSpace(22);
  drawSectionHeading(pdf, "20-Year Cost Projection", PAGE_MARGIN, cursorY);
  cursorY += 12;

  ensureSpace(190);
  drawProjectionChart(pdf, PAGE_MARGIN, cursorY, contentWidth, 180, input.plannerFinancials);
  cursorY += 190;

  const packageSummaryLines = [
    "Export package includes:",
    "- full roof line geometry and polygons",
    "- obstacle markers and exclusion zones",
    "- roof layout panel polygons",
    "- planner inputs, incentives, costs, break-even, and 20-year projection",
    `JSON file: ${jsonFileName}`,
  ];
  const wrappedPackageSummary = packageSummaryLines.flatMap((line) => pdf.splitTextToSize(line, contentWidth));
  ensureSpace(wrappedPackageSummary.length * 12 + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(71, 85, 105);
  pdf.text(wrappedPackageSummary, PAGE_MARGIN, cursorY);

  const pdfBlob = pdf.output("blob");
  downloadBlob(pdfBlob, pdfFileName);

  return {
    pdfFileName,
    jsonFileName,
  };
}