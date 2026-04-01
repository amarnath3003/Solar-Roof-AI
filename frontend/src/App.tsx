import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { MainHeader } from "@/components/Layout";
import { WorkspaceContent } from "@/components/Workspace";
import { useAutoRoofDetection } from "@/hooks/useAutoRoofDetection";
import { useAddressSearch } from "@/hooks/useAddressSearch";
import { useLeafletDraw } from "@/hooks/useLeafletDraw";
import { captureMapSnapshot } from "@/lib/mapSnapshot";
import { autoPackPanels, buildPanelLayoutContext, getPanelTypeDefinition, validatePanelPlacement } from "@/lib/panelLayout";
import { calculateRoofAreaSummary } from "@/lib/roofArea";
import { calculateSolarHeatmap } from "@/lib/solarHeatmap";
import { getActiveRoofFootprint } from "@/lib/sunProjection";
import "@/styles/leaflet-custom.css";
import {
  AutoRoofDetectionResult,
  ObstacleMarker,
  PanelLayoutMode,
  PanelTypeId,
  PlacedPanel,
  RoofAreaSummary,
  RoofElement,
  ViewMode,
} from "@/types";

function downloadRoofData(roofElements: RoofElement[], obstacleMarkers: ObstacleMarker[]) {
  const featureCollection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features: [
      ...roofElements.map(
        (element) =>
          ({
            ...element.geoJSON,
            properties: {
              ...(element.geoJSON.properties ?? {}),
              elementType: element.type,
              style: element.style,
              source: element.source,
              confidence: element.confidence,
              slope: element.slope,
            },
          }) as GeoJSON.Feature
      ),
      ...obstacleMarkers.map(
        (marker) =>
          ({
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: [marker.position[1], marker.position[0]],
            },
            properties: {
              type: marker.type,
              label: marker.label,
              source: marker.source,
              confidence: marker.confidence,
              estimatedHeightM: marker.estimatedHeightM,
            },
          }) as GeoJSON.Feature
      ),
    ],
  };

  const dataUrl = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(featureCollection, null, 2))}`;
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = "roof_monochrome_export.geojson";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createPlacedPanelRecord(
  feature: GeoJSON.Feature<GeoJSON.Polygon>,
  panelTypeId: PanelTypeId,
  source: "manual" | "auto"
): PlacedPanel {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    panelTypeId,
    source,
    feature,
  };
}

export default function App() {
  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("normal");
  const [detectionConfidenceThreshold, setDetectionConfidenceThreshold] = useState(0.45);
  const [detectionPreview, setDetectionPreview] = useState<AutoRoofDetectionResult | null>(null);
  const [detectionMessage, setDetectionMessage] = useState<string | null>(null);
  const [roofAreaSummary, setRoofAreaSummary] = useState<RoofAreaSummary | null>(null);
  const [roofAreaMessage, setRoofAreaMessage] = useState<string | null>(null);
  const [solarOverlayEnabled, setSolarOverlayEnabled] = useState(false);
  const [panelTypeId, setPanelTypeId] = useState<PanelTypeId>("standard-residential");
  const [panelLayoutMode, setPanelLayoutMode] = useState<PanelLayoutMode>("auto");
  const [autoPackPanelLimit, setAutoPackPanelLimit] = useState(25);
  const [placedPanels, setPlacedPanels] = useState<PlacedPanel[]>([]);
  const [panelLayoutMessage, setPanelLayoutMessage] = useState<string | null>(null);

  const {
    address,
    setAddress,
    coordinates,
    searchResults,
    recentSearches,
    isSearching,
    selectAddress,
    handleSearchSubmit,
  } = useAddressSearch({
    onLocationSelected: () => {
      setViewMode("normal");
    },
  });

  const {
    detectFromSnapshot,
    isDetecting,
    error: detectionError,
    clearError: clearDetectionError,
  } = useAutoRoofDetection();

  const activeRoofFootprint = getActiveRoofFootprint(roofElements);
  const panelLayoutContext = useMemo(
    () => buildPanelLayoutContext(roofElements, obstacleMarkers),
    [roofElements, obstacleMarkers]
  );
  const selectedPanelType = useMemo(() => getPanelTypeDefinition(panelTypeId), [panelTypeId]);
  const estimatedPanelKw = useMemo(
    () => Number((placedPanels.length * selectedPanelType.kw).toFixed(1)),
    [placedPanels.length, selectedPanelType.kw]
  );
  const solarAnalysis = useMemo(
    () =>
      activeRoofFootprint
        ? calculateSolarHeatmap(activeRoofFootprint, {
            obstacleMarkers,
          })
        : null,
    [activeRoofFootprint, obstacleMarkers]
  );
  const solarHeatmap = solarOverlayEnabled ? solarAnalysis : null;
  const panelAlignmentAngleDegrees = solarAnalysis?.alignmentAngleDegrees ?? activeRoofFootprint?.slope?.aspectDegrees ?? 180;

  const handlePlaceManualPanel = useCallback(
    (feature: GeoJSON.Feature<GeoJSON.Polygon>) => {
      if (!validatePanelPlacement(feature, panelLayoutContext, placedPanels.map((panel) => panel.feature)).isValid) {
        return;
      }

      setPlacedPanels((previous) => [...previous, createPlacedPanelRecord(feature, panelTypeId, "manual")]);
      setPanelLayoutMessage("Manual panel stamped into the current usable roof area.");
    },
    [panelLayoutContext, panelTypeId, placedPanels]
  );

  const {
    mapContainerRef,
    mapRef,
    featureGroupRef,
    showDetectionPreview,
    clearDetectionPreview,
    acceptDetectionPreview,
  } = useLeafletDraw(
    coordinates,
    viewMode,
    showMapTools,
    setRoofElements,
    setObstacleMarkers,
    solarHeatmap,
    {
      context: panelLayoutContext,
      mode: panelLayoutMode,
      selectedPanelTypeId: panelTypeId,
      alignmentAngleDegrees: panelAlignmentAngleDegrees,
      placedPanels,
      onPlacePanel: handlePlaceManualPanel,
    }
  );

  useEffect(() => {
    setDetectionPreview(null);
    setDetectionMessage(null);
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
    setPlacedPanels([]);
    setPanelLayoutMessage(null);
    clearDetectionPreview();
    clearDetectionError();
  }, [coordinates, clearDetectionError, clearDetectionPreview]);

  useEffect(() => {
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
  }, [roofElements, obstacleMarkers]);

  useEffect(() => {
    if (placedPanels.length === 0) {
      return;
    }

    setPlacedPanels([]);
    setPanelLayoutMessage("Roof or obstacle geometry changed. Panel layout cleared so you can repack it against the new exclusions.");
  }, [obstacleMarkers, roofElements]);

  const toggleWorkspace = () => {
    setShowMapTools((previous) => {
      const next = !previous;
      if (next) setViewMode("satellite");
      if (!next) {
        setDetectionPreview(null);
        clearDetectionPreview();
      }
      return next;
    });
  };

  const clearAllData = () => {
    featureGroupRef.current?.clearLayers();
    clearDetectionPreview();
    setDetectionPreview(null);
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
    setRoofElements([]);
    setObstacleMarkers([]);
    setPlacedPanels([]);
    setPanelLayoutMessage(null);
  };

  const exportGeoJson = () => {
    downloadRoofData(roofElements, obstacleMarkers);
  };

  const autoPackPanelLayout = useCallback(() => {
    setPanelLayoutMode("auto");

    if (!panelLayoutContext.primaryRoof) {
      setPanelLayoutMessage("Draw one primary roof polygon first, then add any inner lines or shapes as exclusion zones.");
      return;
    }

    if (panelLayoutContext.edgeBufferMeters > 0 && !panelLayoutContext.usableRoof) {
      setPlacedPanels([]);
      setPanelLayoutMessage("The current edge buffer removes all usable roof area. Reduce the setback before packing.");
      return;
    }

    const { panels } = autoPackPanels(panelLayoutContext, panelTypeId, panelAlignmentAngleDegrees, {
      maxPanels: autoPackPanelLimit,
      solarHeatmap: solarAnalysis,
    });
    setPlacedPanels(panels.map((feature) => createPlacedPanelRecord(feature, panelTypeId, "auto")));

    if (panels.length === 0) {
      setPanelLayoutMessage("No valid panel placements were found inside the roof after exclusions and edge checks.");
      return;
    }

    setPanelLayoutMessage(
      solarAnalysis
        ? `Auto-packed ${panels.length} panel(s), prioritizing the greener solar zones first and staying within the ${autoPackPanelLimit}-panel cap.`
        : `Auto-packed ${panels.length} panel(s) while avoiding ${panelLayoutContext.exclusionZones.length} exclusion zone(s) and staying within the ${autoPackPanelLimit}-panel cap.`
    );
  }, [autoPackPanelLimit, panelAlignmentAngleDegrees, panelLayoutContext, panelTypeId, solarAnalysis]);

  const clearAllPanels = useCallback(() => {
    setPlacedPanels([]);
    setPanelLayoutMessage("Panel layout cleared.");
  }, []);

  const runAutoDetection = useCallback(async () => {
    if (!coordinates || !mapRef.current || !mapContainerRef.current) {
      setDetectionMessage("Select a house location and open workspace before running auto detection.");
      return;
    }

    try {
      const activeMap = mapRef.current;
      setViewMode("satellite");
      setDetectionMessage(null);

      // Give the satellite layer a moment to become visible before snapshot capture.
      await delay(200);
      activeMap.invalidateSize();
      await delay(150);

      const snapshot = await captureMapSnapshot(mapContainerRef.current, activeMap);
      const bounds = activeMap.getBounds();

      const detection = await detectFromSnapshot({
        center: coordinates,
        bounds: {
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        },
        snapshotBase64: snapshot.snapshotBase64,
        width: snapshot.width,
        height: snapshot.height,
        zoom: activeMap.getZoom(),
        roofConfidenceThreshold: detectionConfidenceThreshold,
        obstacleConfidenceThreshold: Math.max(0.2, detectionConfidenceThreshold - 0.05),
      });

      setDetectionPreview(detection);
      showDetectionPreview(detection);

      if (detection.roofPlanes.length === 0) {
        setDetectionMessage("No high-confidence roof edges found. Try zooming in and rerun detection.");
      } else if (detection.metadata.warnings.length > 0) {
        setDetectionMessage(detection.metadata.warnings[0]);
      }
    } catch (error) {
      clearDetectionPreview();
      setDetectionPreview(null);
      const fallbackMessage =
        "Auto detection failed. This can happen when tile snapshots are blocked by imagery CORS rules. Continue with manual mapping for this location.";
      setDetectionMessage(error instanceof Error ? error.message : fallbackMessage);
    }
  }, [
    coordinates,
    detectFromSnapshot,
    detectionConfidenceThreshold,
    mapContainerRef,
    mapRef,
    showDetectionPreview,
    clearDetectionPreview,
  ]);

  const acceptAutoDetection = useCallback(() => {
    if (!detectionPreview) return;
    acceptDetectionPreview(detectionPreview);
    setDetectionMessage(
      `Accepted ${detectionPreview.roofPlanes.length} roof plane(s) and ${detectionPreview.obstacles.length} obstacle(s).`
    );
    setDetectionPreview(null);
  }, [acceptDetectionPreview, detectionPreview]);

  const rejectAutoDetection = useCallback(() => {
    clearDetectionPreview();
    setDetectionPreview(null);
    setDetectionMessage("Detection preview cleared. You can rerun auto detection or continue manual mapping.");
  }, [clearDetectionPreview]);

  const calculateSqFt = useCallback(() => {
    const summary = calculateRoofAreaSummary(featureGroupRef.current);

    if (!summary) {
      setRoofAreaSummary(null);
      setRoofAreaMessage("Draw at least one roof polygon, rectangle, or circle before calculating solar surface area.");
      return;
    }

    setRoofAreaSummary(summary);
    setRoofAreaMessage(
      summary.ignoredRoofShapes > 0
        ? `Area updated. Ignored ${summary.ignoredRoofShapes} unsupported roof outline(s).`
        : `Area updated across ${summary.roofShapeCount} roof outline(s).`
    );
  }, [featureGroupRef]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#050505] font-sans text-zinc-100 selection:bg-white/20 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0 mix-blend-overlay" />

      <MainHeader
        address={address}
        isSearching={isSearching}
        searchResults={searchResults}
        recentSearches={recentSearches}
        coordinates={coordinates}
        showMapTools={showMapTools}
        viewMode={viewMode}
        solarOverlayEnabled={solarOverlayEnabled}
        onAddressChange={setAddress}
        onSearchSubmit={handleSearchSubmit}
        onSelectAddress={selectAddress}
        onToggleWorkspace={toggleWorkspace}
        onSetViewMode={setViewMode}
        onToggleSolarOverlay={() => setSolarOverlayEnabled((previous) => !previous)}
      />

      <main className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-5 lg:px-8 lg:pb-8 lg:pt-6 xl:px-10">
        <WorkspaceContent
          coordinates={coordinates}
          viewMode={viewMode}
          showMapTools={showMapTools}
          roofElements={roofElements}
          obstacleMarkers={obstacleMarkers}
          mapContainerRef={mapContainerRef}
          onClearAll={clearAllData}
          onExport={exportGeoJson}
          onAutoDetect={runAutoDetection}
          onCalculateSqFt={calculateSqFt}
          onAcceptDetection={acceptAutoDetection}
          onRejectDetection={rejectAutoDetection}
          isAutoDetecting={isDetecting}
          detectionPreview={detectionPreview}
          detectionMessage={detectionMessage ?? detectionError}
          roofAreaSummary={roofAreaSummary}
          roofAreaMessage={roofAreaMessage}
          detectionConfidenceThreshold={detectionConfidenceThreshold}
          onDetectionConfidenceThresholdChange={setDetectionConfidenceThreshold}
          solarOverlayEnabled={solarOverlayEnabled}
          solarHeatmap={solarHeatmap}
          panelTypeId={panelTypeId}
          onPanelTypeChange={setPanelTypeId}
          panelLayoutMode={panelLayoutMode}
          onPanelLayoutModeChange={setPanelLayoutMode}
          autoPackPanelLimit={autoPackPanelLimit}
          onAutoPackPanelLimitChange={setAutoPackPanelLimit}
          onAutoPackPanels={autoPackPanelLayout}
          onClearPanels={clearAllPanels}
          placedPanelCount={placedPanels.length}
          estimatedPanelKw={estimatedPanelKw}
          panelLayoutMessage={panelLayoutMessage}
          exclusionZoneCount={panelLayoutContext.exclusionZones.length}
          hasPrimaryRoof={panelLayoutContext.primaryRoof !== null}
        />
      </main>
    </div>
  );
}
