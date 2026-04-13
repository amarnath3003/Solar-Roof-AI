import html2canvas from "html2canvas";
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

async function captureBlueprintImage(mapContainer: HTMLDivElement): Promise<CapturedBlueprintImage> {
  await requestAnimationFrameAsync();
  await requestAnimationFrameAsync();

  const canvas = await html2canvas(mapContainer, {
    useCORS: true,
    allowTaint: false,
    backgroundColor: "#07111f",
    logging: false,
    imageTimeout: 6_000,
    scale: 1.1,
  });

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width: canvas.width,
    height: canvas.height,
  };
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
  const image = await captureBlueprintImage(input.mapContainer);
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

  downloadBlob(new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" }), jsonFileName);

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

  pdf.save(pdfFileName);

  return {
    pdfFileName,
    jsonFileName,
  };
}