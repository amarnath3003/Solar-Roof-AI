import type { jsPDF } from "jspdf";
import type { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import type { SolarHeatmap } from "@/lib/solarHeatmap";
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
  svgFileName: string | null;
};

type LayoutVectorAsset = {
  svgMarkup: string;
  width: number;
  height: number;
  bounds: LayoutBounds;
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

type LayoutBounds = {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
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

function createBounds(): LayoutBounds {
  return {
    minLng: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  };
}

function includeCoordinate(bounds: LayoutBounds, coordinate: number[]) {
  const [lng, lat] = coordinate;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return;
  }

  bounds.minLng = Math.min(bounds.minLng, lng);
  bounds.maxLng = Math.max(bounds.maxLng, lng);
  bounds.minLat = Math.min(bounds.minLat, lat);
  bounds.maxLat = Math.max(bounds.maxLat, lat);
}

function forEachPolygonCoordinates(
  geometry: GeoJSON.Geometry,
  callback: (rings: number[][][]) => void
) {
  if (geometry.type === "Polygon") {
    callback(geometry.coordinates);
    return;
  }

  if (geometry.type === "MultiPolygon") {
    geometry.coordinates.forEach((polygonCoordinates) => callback(polygonCoordinates));
  }
}

function forEachLineCoordinates(
  geometry: GeoJSON.Geometry,
  callback: (line: number[][]) => void
) {
  if (geometry.type === "LineString") {
    callback(geometry.coordinates);
    return;
  }

  if (geometry.type === "MultiLineString") {
    geometry.coordinates.forEach((lineCoordinates) => callback(lineCoordinates));
  }
}

function includeFeatureInBounds(bounds: LayoutBounds, feature: GeoJSON.Feature) {
  const { geometry } = feature;

  forEachPolygonCoordinates(geometry, (rings) => {
    rings.forEach((ring) => {
      ring.forEach((coordinate) => includeCoordinate(bounds, coordinate));
    });
  });

  forEachLineCoordinates(geometry, (line) => {
    line.forEach((coordinate) => includeCoordinate(bounds, coordinate));
  });

  if (geometry.type === "Point") {
    includeCoordinate(bounds, geometry.coordinates);
  }

  if (geometry.type === "MultiPoint") {
    geometry.coordinates.forEach((coordinate) => includeCoordinate(bounds, coordinate));
  }
}

function hasFiniteBounds(bounds: LayoutBounds) {
  return (
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.maxLng) &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLat)
  );
}

function normalizeBounds(bounds: LayoutBounds): LayoutBounds {
  const normalized = { ...bounds };

  if (normalized.maxLng - normalized.minLng < 1e-8) {
    normalized.maxLng += 0.0002;
    normalized.minLng -= 0.0002;
  }

  if (normalized.maxLat - normalized.minLat < 1e-8) {
    normalized.maxLat += 0.0002;
    normalized.minLat -= 0.0002;
  }

  return normalized;
}

function collectLayoutBounds(input: ExportBlueprintReportInput): LayoutBounds | null {
  const bounds = createBounds();

  if (input.panelLayoutContext.primaryRoof) {
    includeFeatureInBounds(bounds, input.panelLayoutContext.primaryRoof as GeoJSON.Feature);
  }

  input.roofElements.forEach((element) => includeFeatureInBounds(bounds, element.geoJSON));
  input.panelLayoutContext.exclusionZones.forEach((zone) => includeFeatureInBounds(bounds, zone as GeoJSON.Feature));
  input.placedPanels.forEach((panel) => includeFeatureInBounds(bounds, panel.feature as GeoJSON.Feature));
  input.obstacleMarkers.forEach((marker) => includeCoordinate(bounds, [marker.position[1], marker.position[0]]));

  if (!hasFiniteBounds(bounds)) {
    return null;
  }

  return normalizeBounds(bounds);
}

function createLayoutProjector(
  bounds: LayoutBounds,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
  padding: number
) {
  const usableWidth = Math.max(1, targetWidth - padding * 2);
  const usableHeight = Math.max(1, targetHeight - padding * 2);
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  const scale = Math.min(usableWidth / spanLng, usableHeight / spanLat);
  const offsetX = targetX + (targetWidth - spanLng * scale) / 2;
  const offsetY = targetY + (targetHeight + spanLat * scale) / 2;

  return (lng: number, lat: number): ScreenPoint => ({
    x: offsetX + (lng - bounds.minLng) * scale,
    y: offsetY - (lat - bounds.minLat) * scale,
  });
}

function normalizeRing(ring: number[][]) {
  if (ring.length < 2) {
    return ring;
  }

  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng === lastLng && firstLat === lastLat) {
    return ring.slice(0, ring.length - 1);
  }

  return ring;
}

function mapRingToPathData(ring: number[][], project: (lng: number, lat: number) => ScreenPoint) {
  const normalized = normalizeRing(ring);
  if (normalized.length < 3) {
    return null;
  }

  const points = normalized.map(([lng, lat]) => project(lng, lat));
  const start = points[0];
  const segments = points.slice(1).map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)} ${segments} Z`;
}

function mapLineToPathData(line: number[][], project: (lng: number, lat: number) => ScreenPoint) {
  if (line.length < 2) {
    return null;
  }

  const points = line.map(([lng, lat]) => project(lng, lat));
  const start = points[0];
  const segments = points.slice(1).map((point) => `L${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  return `M${start.x.toFixed(2)} ${start.y.toFixed(2)} ${segments}`;
}

function buildLayoutVectorAsset(
  input: ExportBlueprintReportInput,
  width: number,
  height: number
): LayoutVectorAsset | null {
  const bounds = collectLayoutBounds(input);
  if (!bounds) {
    return null;
  }

  const project = createLayoutProjector(bounds, 0, 0, width, height, 18);
  const svgElements: string[] = [];

  const pushFeature = (
    feature: GeoJSON.Feature,
    polygonStyle: FillStrokeStyle,
    lineStyle: StrokeStyle
  ) => {
    forEachPolygonCoordinates(feature.geometry, (rings) => {
      const ringPaths = rings
        .map((ring) => mapRingToPathData(ring, project))
        .filter((path): path is string => path !== null)
        .join(" ");
      if (!ringPaths) {
        return;
      }

      svgElements.push(
        `<path d="${ringPaths}" fill="${polygonStyle.fill ?? "none"}" fill-opacity="0.65" stroke="${polygonStyle.stroke ?? "none"}" stroke-width="${(polygonStyle.width ?? 1).toFixed(2)}" ${polygonStyle.dash ? `stroke-dasharray="${polygonStyle.dash.join(" ")}"` : ""} fill-rule="evenodd" />`
      );
    });

    forEachLineCoordinates(feature.geometry, (line) => {
      const linePath = mapLineToPathData(line, project);
      if (!linePath) {
        return;
      }

      svgElements.push(
        `<path d="${linePath}" fill="none" stroke="${lineStyle.stroke}" stroke-width="${lineStyle.width.toFixed(2)}" ${lineStyle.dash ? `stroke-dasharray="${lineStyle.dash.join(" ")}"` : ""} />`
      );
    });
  };

  if (input.panelLayoutContext.primaryRoof) {
    pushFeature(
      input.panelLayoutContext.primaryRoof as GeoJSON.Feature,
      { fill: "#dcfce7", stroke: "#16a34a", width: 1.4 },
      { stroke: "#16a34a", width: 1.4 }
    );
  }

  input.roofElements.forEach((element) => {
    const stroke = element.source === "auto-detected" ? "#0891b2" : "#334155";
    pushFeature(
      element.geoJSON,
      {
        fill: element.geoJSON.geometry.type.includes("Polygon") ? "#e2e8f0" : undefined,
        stroke,
        width: element.geoJSON.geometry.type.includes("Line") ? 1.2 : 1.4,
      },
      {
        stroke,
        width: element.geoJSON.geometry.type.includes("Line") ? 1.2 : 1.4,
        dash: element.geoJSON.geometry.type.includes("Line") ? [6, 4] : undefined,
      }
    );
  });

  input.panelLayoutContext.exclusionZones.forEach((zone) => {
    pushFeature(
      zone as GeoJSON.Feature,
      { fill: "#fef3c7", stroke: "#f59e0b", width: 1.2, dash: [7, 4] },
      { stroke: "#f59e0b", width: 1.2, dash: [7, 4] }
    );
  });

  input.placedPanels.forEach((panel) => {
    pushFeature(
      panel.feature as GeoJSON.Feature,
      {
        fill: panel.source === "manual" ? "#1d4ed8" : "#2563eb",
        stroke: "#bfdbfe",
        width: 0.9,
      },
      { stroke: "#bfdbfe", width: 0.9 }
    );
  });

  input.obstacleMarkers.forEach((marker) => {
    const point = project(marker.position[1], marker.position[0]);
    const fill = marker.source === "auto-detected" ? "#f97316" : "#eab308";
    svgElements.push(
      `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4.8" fill="${fill}" stroke="#ffffff" stroke-width="1.3" />`
    );
  });

  const svgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<g fill="none" stroke-linecap="round" stroke-linejoin="round">`,
    ...svgElements,
    `</g>`,
    `</svg>`,
  ].join("");

  return {
    svgMarkup,
    width,
    height,
    bounds,
  };
}

function drawPathOnPdf(
  pdf: jsPDF,
  points: ScreenPoint[],
  options: {
    strokeRgb: [number, number, number];
    width: number;
    dash?: number[];
    closePath?: boolean;
    fillRgb?: [number, number, number];
  }
) {
  if (points.length < 2) {
    return;
  }

  const vectors = points.slice(1).map((point, index) => {
    const previous = points[index];
    return [point.x - previous.x, point.y - previous.y];
  });

  const doc = pdf as any;
  doc.setDrawColor(...options.strokeRgb);
  doc.setLineWidth(options.width);
  doc.setLineDashPattern(options.dash ?? [], 0);

  if (options.fillRgb) {
    doc.setFillColor(...options.fillRgb);
  }

  doc.lines(
    vectors,
    points[0].x,
    points[0].y,
    [1, 1],
    options.fillRgb ? "FD" : "S",
    options.closePath ?? false
  );
}

function drawVectorLayoutInPdf(
  pdf: jsPDF,
  input: ExportBlueprintReportInput,
  bounds: LayoutBounds,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const project = createLayoutProjector(bounds, x, y, width, height, 10);

  const drawFeature = (
    feature: GeoJSON.Feature,
    polygonStyle: {
      strokeRgb: [number, number, number];
      width: number;
      fillRgb?: [number, number, number];
      dash?: number[];
    },
    lineStyle: {
      strokeRgb: [number, number, number];
      width: number;
      dash?: number[];
    }
  ) => {
    forEachPolygonCoordinates(feature.geometry, (rings) => {
      rings.forEach((ring) => {
        const normalized = normalizeRing(ring);
        const points = normalized.map(([lng, lat]) => project(lng, lat));
        drawPathOnPdf(pdf, points, {
          strokeRgb: polygonStyle.strokeRgb,
          width: polygonStyle.width,
          fillRgb: polygonStyle.fillRgb,
          dash: polygonStyle.dash,
          closePath: true,
        });
      });
    });

    forEachLineCoordinates(feature.geometry, (line) => {
      const points = line.map(([lng, lat]) => project(lng, lat));
      drawPathOnPdf(pdf, points, {
        strokeRgb: lineStyle.strokeRgb,
        width: lineStyle.width,
        dash: lineStyle.dash,
      });
    });
  };

  if (input.panelLayoutContext.primaryRoof) {
    drawFeature(
      input.panelLayoutContext.primaryRoof as GeoJSON.Feature,
      { strokeRgb: [22, 163, 74], width: 1.2, fillRgb: [220, 252, 231] },
      { strokeRgb: [22, 163, 74], width: 1.2 }
    );
  }

  input.roofElements.forEach((element) => {
    const strokeRgb: [number, number, number] = element.source === "auto-detected" ? [8, 145, 178] : [51, 65, 85];
    drawFeature(
      element.geoJSON,
      {
        strokeRgb,
        width: element.geoJSON.geometry.type.includes("Line") ? 1 : 1.2,
        fillRgb: element.geoJSON.geometry.type.includes("Polygon") ? [226, 232, 240] : undefined,
      },
      {
        strokeRgb,
        width: element.geoJSON.geometry.type.includes("Line") ? 1 : 1.2,
        dash: element.geoJSON.geometry.type.includes("Line") ? [5, 3] : undefined,
      }
    );
  });

  input.panelLayoutContext.exclusionZones.forEach((zone) => {
    drawFeature(
      zone as GeoJSON.Feature,
      { strokeRgb: [245, 158, 11], width: 1, fillRgb: [254, 243, 199], dash: [6, 3] },
      { strokeRgb: [245, 158, 11], width: 1, dash: [6, 3] }
    );
  });

  input.placedPanels.forEach((panel) => {
    drawFeature(
      panel.feature as GeoJSON.Feature,
      {
        strokeRgb: [191, 219, 254],
        width: 0.8,
        fillRgb: panel.source === "manual" ? [29, 78, 216] : [37, 99, 235],
      },
      {
        strokeRgb: [191, 219, 254],
        width: 0.8,
      }
    );
  });

  input.obstacleMarkers.forEach((marker) => {
    const point = project(marker.position[1], marker.position[0]);
    const fillRgb: [number, number, number] = marker.source === "auto-detected" ? [249, 115, 22] : [234, 179, 8];
    const doc = pdf as any;
    doc.setDrawColor(255, 255, 255);
    doc.setFillColor(...fillRgb);
    doc.setLineWidth(1);
    doc.circle(point.x, point.y, 3.5, "FD");
  });
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

function drawProjectionTable(
  pdf: jsPDF,
  data: SolarFinancialResults["financialProjection"],
  x: number,
  y: number,
  width: number,
  ensureSpace: (heightNeeded: number) => void
) {
  const rowHeight = 13;
  const columnWidth = [58, 88, 88, 88, 88];
  const headers = ["Year", "No Solar", "With Solar", "Production", "Grid Use"];
  let cursorY = y;

  const drawHeader = () => {
    pdf.setFillColor(241, 245, 249);
    pdf.rect(x, cursorY - 9, width, rowHeight + 4, "F");

    let cursorX = x + 4;
    headers.forEach((header, index) => {
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(8);
      pdf.setTextColor(15, 23, 42);
      pdf.text(header, cursorX, cursorY);
      cursorX += columnWidth[index];
    });

    cursorY += rowHeight;
  };

  ensureSpace(24);
  drawHeader();

  data.forEach((point, index) => {
    ensureSpace(rowHeight + 4);

    if (index % 2 === 1) {
      pdf.setFillColor(248, 250, 252);
      pdf.rect(x, cursorY - 9, width, rowHeight + 2, "F");
    }

    let cursorX = x + 4;
    const rowValues = [
      `${point.calendarYear}`,
      formatCompactMoney(point.costWithoutSolar),
      formatCompactMoney(point.costWithSolar),
      `${formatNumber(point.yearlyProductionKwh, 0)} kWh`,
      `${formatNumber(point.gridDependencyKwh, 0)} kWh`,
    ];

    rowValues.forEach((value, colIndex) => {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor(51, 65, 85);
      pdf.text(value, cursorX, cursorY);
      cursorX += columnWidth[colIndex];
    });

    cursorY += rowHeight;
  });

  return cursorY;
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
  const svgFileName = `${filePrefix}-${fileTimestamp}-layout-vector.svg`;
  const layoutVector = buildLayoutVectorAsset(input, 1400, 900);
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
  const panelType = PANEL_TYPES[input.panelTypeId];
  const panelSurfaceSqFt = input.placedPanels.length * panelType.widthM * panelType.heightM * 10.7639;

  const exportPayload = {
    metadata: {
      generatedAt,
      generatedLabel,
      title: reportTitle,
      address: trimmedAddress,
      coordinates: input.coordinates,
      exportVersion: "1.0",
      vectorSvgAvailable: layoutVector !== null,
    },
    geometry: {
      roofElementCount: input.roofElements.length,
      lineGeometryCount,
      obstacleCount: input.obstacleMarkers.length,
      panelCount: input.placedPanels.length,
      panelSurfaceSqFt: Number(panelSurfaceSqFt.toFixed(2)),
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

  if (layoutVector) {
    downloadBlob(new Blob([layoutVector.svgMarkup], { type: "image/svg+xml;charset=utf-8" }), svgFileName);
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

  ensureSpace(314);
  drawSectionHeading(pdf, "Layout Plan (Vector)", PAGE_MARGIN, cursorY);
  cursorY += 10;
  const vectorBoxHeight = 286;
  pdf.setDrawColor(203, 213, 225);
  pdf.roundedRect(PAGE_MARGIN - 1, cursorY, contentWidth + 2, vectorBoxHeight, 6, 6, "S");

  if (layoutVector) {
    drawVectorLayoutInPdf(
      pdf,
      input,
      layoutVector.bounds,
      PAGE_MARGIN + 6,
      cursorY + 6,
      contentWidth - 12,
      vectorBoxHeight - 12
    );
  } else {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(100, 116, 139);
    pdf.text("No drawable layout geometry found. Draw roof geometry, obstacles, or panels before exporting.", PAGE_MARGIN + 10, cursorY + 22);
  }

  cursorY += vectorBoxHeight + 16;

  const narrative = `This proposal models a ${input.plannerFinancials.activePanelCount}-panel ${panelType.label.toLowerCase()} system sized at ${formatNumber(input.plannerFinancials.installationSizeKw, 2)} kW. The plan offsets about ${formatPercent(input.plannerFinancials.energyCoveredDisplayPercent, 1)} of annual demand, delivers estimated 20-year savings of ${formatMoney(input.plannerFinancials.totalTwentyYearSavings)}, and reaches break-even in ${input.plannerFinancials.breakEvenCalendarYear ?? "the post-20-year horizon"}.`;
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
  drawSectionHeading(pdf, "Design Engineering Detail", PAGE_MARGIN, cursorY);
  cursorY += 14;

  const designDetailMetrics: MetricItem[] = [
    { label: "Panel model", value: panelType.label },
    { label: "Panel dimensions", value: `${panelType.widthM}m x ${panelType.heightM}m` },
    { label: "Per-panel capacity", value: `${input.plannerInputs.panelCapacityWatts} W` },
    { label: "Total panel surface", value: `${formatNumber(panelSurfaceSqFt, 1)} sq ft` },
    { label: "Layout mode", value: input.panelLayoutMode.toUpperCase() },
    {
      label: "Primary roof detected",
      value: input.panelLayoutContext.primaryRoof ? "Yes" : "No",
    },
    {
      label: "Blocked roof area",
      value:
        input.roofAreaSummary !== null
          ? `${formatNumber(input.roofAreaSummary.blockedSqFt, 0)} sq ft`
          : "Not calculated",
    },
    {
      label: "Gross roof area",
      value:
        input.roofAreaSummary !== null
          ? `${formatNumber(input.roofAreaSummary.grossSqFt, 0)} sq ft`
          : "Not calculated",
    },
    {
      label: "Solar best zone",
      value: input.solarHeatmap ? input.solarHeatmap.bestZoneLabel : "Not available",
    },
    {
      label: "Average solar exposure",
      value: input.solarHeatmap ? `${input.solarHeatmap.averageExposurePercent}%` : "Not available",
    },
  ];

  ensureSpace(220);
  cursorY += drawMetricGrid(pdf, PAGE_MARGIN, cursorY, contentWidth, designDetailMetrics, 2);
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
  drawSectionHeading(pdf, "Financial Model Assumptions", PAGE_MARGIN, cursorY);
  cursorY += 14;

  const assumptionsMetrics: MetricItem[] = [
    { label: "Monthly consumption", value: `${formatNumber(input.plannerFinancials.monthlyUsageKwh, 1)} kWh` },
    { label: "Annual consumption", value: `${formatNumber(input.plannerFinancials.annualConsumptionKwh, 0)} kWh` },
    { label: "Target system size", value: `${formatNumber(input.plannerFinancials.targetSystemSizeKw, 2)} kW` },
    { label: "Target panel count", value: `${input.plannerFinancials.targetPanelCount}` },
    {
      label: "Roof max panel count",
      value:
        input.plannerFinancials.roofMaxPanelCount === null
          ? "Not constrained"
          : `${input.plannerFinancials.roofMaxPanelCount}`,
    },
    { label: "Effective yield", value: `${formatNumber(input.plannerFinancials.effectiveYieldKwhPerKw, 1)} kWh/kW` },
    { label: "Performance ratio", value: `${formatNumber(input.plannerFinancials.performanceRatioApplied, 3)}` },
    { label: "Estimated shade loss", value: `${formatNumber(input.plannerFinancials.shadeLossPercent, 1)}%` },
    { label: "Annual shortfall", value: `${formatNumber(input.plannerFinancials.annualShortfallKwh, 0)} kWh` },
    { label: "Monthly shortfall", value: `${formatNumber(input.plannerFinancials.monthlyShortfallKwh, 0)} kWh` },
  ];

  ensureSpace(220);
  cursorY += drawMetricGrid(pdf, PAGE_MARGIN, cursorY, contentWidth, assumptionsMetrics, 2);
  cursorY += 8;

  ensureSpace(22);
  drawSectionHeading(pdf, "20-Year Cost Projection", PAGE_MARGIN, cursorY);
  cursorY += 12;

  ensureSpace(190);
  drawProjectionChart(pdf, PAGE_MARGIN, cursorY, contentWidth, 180, input.plannerFinancials);
  cursorY += 190;

  ensureSpace(24);
  drawSectionHeading(pdf, "20-Year Projection Table", PAGE_MARGIN, cursorY);
  cursorY += 13;
  cursorY = drawProjectionTable(pdf, input.plannerFinancials.financialProjection, PAGE_MARGIN, cursorY, contentWidth, ensureSpace);
  cursorY += 10;

  const packageSummaryLines = [
    "Export package includes:",
    "- vector SVG layout auto-zoomed to maximum geometry coverage",
    "- full roof line geometry and polygons",
    "- obstacle markers and exclusion zones",
    "- roof layout panel polygons",
    "- planner inputs, incentives, costs, break-even, and detailed 20-year cashflow table",
    `SVG file: ${layoutVector ? svgFileName : "Not generated (no drawable geometry)"}`,
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
    svgFileName: layoutVector ? svgFileName : null,
  };
}