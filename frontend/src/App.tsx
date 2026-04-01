import { useCallback, useEffect, useMemo, useState } from "react";
import "./styles.css";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { DesktopSidebar, MainHeader, MobileMenuOverlay } from "@/components/Layout";
import { WorkspaceContent } from "@/components/Workspace";
import { useAutoRoofDetection } from "@/hooks/useAutoRoofDetection";
import { useAddressSearch } from "@/hooks/useAddressSearch";
import { useLeafletDraw } from "@/hooks/useLeafletDraw";
import { captureMapSnapshot } from "@/lib/mapSnapshot";
import { calculateRoofAreaSummary } from "@/lib/roofArea";
import { calculateSolarHeatmap } from "@/lib/solarHeatmap";
import { getActiveRoofFootprint } from "@/lib/sunProjection";
import "@/styles/leaflet-custom.css";
import { AutoRoofDetectionResult, ObstacleMarker, RoofAreaSummary, RoofElement, ViewMode } from "@/types";

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

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const {
    address,
    setAddress,
    selectedAddress,
    coordinates,
    searchResults,
    isSearching,
    selectAddress,
    handleSearchSubmit,
  } = useAddressSearch({
    onLocationSelected: () => {
      setViewMode("normal");
      setMobileMenuOpen(false);
    },
  });

  const {
    detectFromSnapshot,
    isDetecting,
    error: detectionError,
    clearError: clearDetectionError,
  } = useAutoRoofDetection();

  const activeRoofFootprint = getActiveRoofFootprint(roofElements);
  const solarHeatmap = useMemo(
    () =>
      activeRoofFootprint && solarOverlayEnabled
        ? calculateSolarHeatmap(activeRoofFootprint, {
            obstacleMarkers,
          })
        : null,
    [activeRoofFootprint, obstacleMarkers, solarOverlayEnabled]
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
    solarHeatmap
  );

  useEffect(() => {
    setDetectionPreview(null);
    setDetectionMessage(null);
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
    clearDetectionPreview();
    clearDetectionError();
  }, [coordinates, clearDetectionError, clearDetectionPreview]);

  useEffect(() => {
    setRoofAreaSummary(null);
    setRoofAreaMessage(null);
  }, [roofElements, obstacleMarkers]);

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
  };

  const exportGeoJson = () => {
    downloadRoofData(roofElements, obstacleMarkers);
  };

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
    <div className="flex h-screen bg-[#050505] font-sans text-zinc-100 overflow-hidden relative selection:bg-white/20 selection:text-white">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_50%)] pointer-events-none z-0" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none z-0 mix-blend-overlay" />

      <MobileMenuOverlay
        open={mobileMenuOpen}
        address={address}
        isSearching={isSearching}
        onClose={() => setMobileMenuOpen(false)}
        onAddressChange={setAddress}
        onSearchSubmit={handleSearchSubmit}
      />

      <DesktopSidebar
        address={address}
        isSearching={isSearching}
        searchResults={searchResults}
        selectedAddress={selectedAddress}
        coordinates={coordinates}
        showMapTools={showMapTools}
        onAddressChange={setAddress}
        onSearchSubmit={handleSearchSubmit}
        onSelectAddress={selectAddress}
        onToggleWorkspace={toggleWorkspace}
      />

      <main className="flex-1 flex flex-col min-w-0 z-10 relative">
        <MainHeader
          viewMode={viewMode}
          solarOverlayEnabled={solarOverlayEnabled}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSetViewMode={setViewMode}
          onToggleSolarOverlay={() => setSolarOverlayEnabled((previous) => !previous)}
        />

        <div className="flex-1 p-6 lg:p-10 overflow-hidden flex flex-col">
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
          />
        </div>
      </main>
    </div>
  );
}
