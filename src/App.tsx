import { useState } from "react";
import "./styles.css";

import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import { DesktopSidebar, MainHeader, MobileMenuOverlay } from "@/components/Layout";
import { WorkspaceContent } from "@/components/Workspace";
import { useAddressSearch } from "@/hooks/useAddressSearch";
import { useLeafletDraw } from "@/hooks/useLeafletDraw";
import "@/styles/leaflet-custom.css";
import { ObstacleMarker, RoofElement, ViewMode } from "@/types";

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

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [roofElements, setRoofElements] = useState<RoofElement[]>([]);
  const [obstacleMarkers, setObstacleMarkers] = useState<ObstacleMarker[]>([]);
  const [showMapTools, setShowMapTools] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("normal");

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

  const { mapContainerRef, featureGroupRef } = useLeafletDraw(
    coordinates,
    viewMode,
    showMapTools,
    setRoofElements,
    setObstacleMarkers
  );

  const toggleWorkspace = () => {
    setShowMapTools((previous) => {
      const next = !previous;
      if (next) setViewMode("satellite");
      return next;
    });
  };

  const clearAllData = () => {
    featureGroupRef.current?.clearLayers();
    setRoofElements([]);
    setObstacleMarkers([]);
  };

  const exportGeoJson = () => {
    downloadRoofData(roofElements, obstacleMarkers);
  };

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
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
          onSetViewMode={setViewMode}
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
          />
        </div>
      </main>
    </div>
  );
}
