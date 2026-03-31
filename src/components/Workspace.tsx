import React from "react";
import { Circle, Download, Layers, Monitor, Search, Square, Trash2 } from "lucide-react";
import { Map } from "@/components/ui/map";
import { Button, Card } from "@/components/ui/glass";
import { Coordinates, ObstacleMarker, RoofElement, ViewMode } from "@/types";

type WorkspaceContentProps = {
  coordinates: Coordinates | null;
  viewMode: ViewMode;
  showMapTools: boolean;
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  mapContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  onClearAll: () => void;
  onExport: () => void;
};

function EmptyState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <Card className="max-w-md w-full text-center flex flex-col items-center gap-8 py-12">
        <div className="relative flex items-center justify-center w-20 h-20 rounded-3xl bg-white/5 border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)]">
          <Search size={32} className="text-white/40" />
          <div className="absolute inset-0 border border-white/20 rounded-3xl animate-ping opacity-20"></div>
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-medium text-white tracking-[0.15em] uppercase">Awaiting Input</h2>
          <p className="text-zinc-500 font-light text-xs tracking-widest leading-relaxed uppercase">
            Initialize location search to load mapping environment
          </p>
        </div>
      </Card>
    </div>
  );
}

function MapViewport({
  coordinates,
  viewMode,
  mapContainerRef,
}: {
  coordinates: Coordinates;
  viewMode: ViewMode;
  mapContainerRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <Card className="flex-1 p-0 rounded-3xl overflow-hidden border-white/20 shadow-2xl relative">
      <div
        className={`absolute inset-0 ${viewMode === "satellite" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"} transition-opacity duration-300`}
      >
        <div ref={mapContainerRef} className="w-full h-full bg-black" />
      </div>
      <div
        className={`absolute inset-0 ${viewMode === "normal" ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"} transition-opacity duration-300`}
      >
        <Map center={[coordinates.lng, coordinates.lat]} zoom={18} />
      </div>
    </Card>
  );
}

function WorkspaceDataPanel({
  roofElements,
  obstacleMarkers,
  onClearAll,
  onExport,
}: {
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  onClearAll: () => void;
  onExport: () => void;
}) {
  return (
    <div className="w-full lg:w-72 flex flex-col gap-6 shrink-0 animate-fade-in-up mt-6 lg:mt-0">
      <Card className="flex flex-col gap-6">
        <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-zinc-400 flex items-center gap-2 border-b border-white/10 pb-4">
          <Layers size={14} className="text-white" /> Intelligence
        </h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-colors">
            <span className="text-3xl font-light text-white">{roofElements.length}</span>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Shapes</span>
          </div>
          <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-2 hover:bg-white/10 transition-colors">
            <span className="text-3xl font-light text-white">{obstacleMarkers.length}</span>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Obstacles</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-2 pt-6 border-t border-white/5">
          <Button
            variant="ghost"
            className="w-full text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
            onClick={onClearAll}
          >
            <Trash2 size={14} /> Clear All Data
          </Button>
          <Button variant="primary" className="w-full" onClick={onExport}>
            <Download size={14} /> Export GeoJSON
          </Button>
        </div>
      </Card>

      <Card className="flex-1 flex flex-col gap-4">
        <h3 className="text-xs uppercase tracking-[0.2em] font-medium text-zinc-400 flex items-center gap-2">
          <Monitor size={14} className="text-white" /> Log
        </h3>
        <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-3">
          {roofElements.length === 0 && obstacleMarkers.length === 0 ? (
            <div className="m-auto text-zinc-600 text-[10px] uppercase tracking-widest text-center">No entities drawn</div>
          ) : (
            <>
              {roofElements.map((element) => (
                <div
                  key={element.id}
                  className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-lg flex items-center gap-2 tracking-wide font-mono border border-white/5"
                >
                  <Square size={10} className="text-white/60" /> {element.type.toUpperCase()} #{element.id.toString().slice(-4)}
                </div>
              ))}
              {obstacleMarkers.map((marker) => (
                <div
                  key={marker.id}
                  className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-lg flex items-center gap-2 tracking-wide font-mono border border-white/5"
                >
                  <Circle size={10} className="text-white/60" /> MKR #{marker.id.toString().slice(-4)}
                </div>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export function WorkspaceContent({
  coordinates,
  viewMode,
  showMapTools,
  roofElements,
  obstacleMarkers,
  mapContainerRef,
  onClearAll,
  onExport,
}: WorkspaceContentProps) {
  if (!coordinates) {
    return <EmptyState />;
  }

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full min-h-0">
      <MapViewport coordinates={coordinates} viewMode={viewMode} mapContainerRef={mapContainerRef} />
      {showMapTools && (
        <WorkspaceDataPanel
          roofElements={roofElements}
          obstacleMarkers={obstacleMarkers}
          onClearAll={onClearAll}
          onExport={onExport}
        />
      )}
    </div>
  );
}
