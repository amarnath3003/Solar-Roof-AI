import React from "react";
import { Bot, Check, Circle, Download, Layers, Loader2, Monitor, Search, Square, Trash2, X } from "lucide-react";
import { Map } from "@/components/ui/map";
import { Button, Card } from "@/components/ui/glass";
import { AutoRoofDetectionResult, Coordinates, ObstacleMarker, RoofElement, ViewMode } from "@/types";

type WorkspaceContentProps = {
  coordinates: Coordinates | null;
  viewMode: ViewMode;
  showMapTools: boolean;
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  mapContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  onClearAll: () => void;
  onExport: () => void;
  onAutoDetect: () => void;
  onAcceptDetection: () => void;
  onRejectDetection: () => void;
  isAutoDetecting: boolean;
  detectionPreview: AutoRoofDetectionResult | null;
  detectionMessage: string | null;
  detectionConfidenceThreshold: number;
  onDetectionConfidenceThresholdChange: (next: number) => void;
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
  onAutoDetect,
  onAcceptDetection,
  onRejectDetection,
  isAutoDetecting,
  detectionPreview,
  detectionMessage,
  detectionConfidenceThreshold,
  onDetectionConfidenceThresholdChange,
}: {
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  onClearAll: () => void;
  onExport: () => void;
  onAutoDetect: () => void;
  onAcceptDetection: () => void;
  onRejectDetection: () => void;
  isAutoDetecting: boolean;
  detectionPreview: AutoRoofDetectionResult | null;
  detectionMessage: string | null;
  detectionConfidenceThreshold: number;
  onDetectionConfidenceThresholdChange: (next: number) => void;
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

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 flex flex-col gap-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Detection Confidence</div>
          <div className="text-xs text-zinc-200">{Math.round(detectionConfidenceThreshold * 100)}%</div>
          <input
            type="range"
            min={30}
            max={90}
            step={5}
            value={Math.round(detectionConfidenceThreshold * 100)}
            onChange={(event) => onDetectionConfidenceThresholdChange(Number(event.target.value) / 100)}
            className="w-full accent-cyan-400"
          />
        </div>

        <div className="flex flex-col gap-3 mt-2 pt-6 border-t border-white/5">
          <Button variant="primary" className="w-full" onClick={onAutoDetect} disabled={isAutoDetecting}>
            {isAutoDetecting ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Detecting Roof...
              </>
            ) : (
              <>
                <Bot size={14} /> Auto Detect Roof
              </>
            )}
          </Button>
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

        {detectionMessage && (
          <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-zinc-300 leading-relaxed">
            {detectionMessage}
          </div>
        )}

        {detectionPreview && (
          <div className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 p-4 flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-cyan-200">Detection Preview</div>
            <div className="text-[10px] text-cyan-100/80 uppercase tracking-wider">
              {detectionPreview.roofPlanes.length} roof plane(s), {detectionPreview.obstacles.length} obstacle(s)
            </div>
            <div className="text-[10px] text-cyan-100/80 uppercase tracking-wider">
              Model {detectionPreview.metadata.model} | {detectionPreview.metadata.processingMs}ms
            </div>
            <div className="text-[10px] text-cyan-100/80 uppercase tracking-wider">
              Filtered {detectionPreview.metadata.filteredRoofPlanes}/{detectionPreview.metadata.roofCandidates} roofs
            </div>
            {detectionPreview.metadata.warningCodes.length > 0 && (
              <div className="text-[10px] text-cyan-100/80 uppercase tracking-wider">
                Warnings: {detectionPreview.metadata.warningCodes.join(", ")}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="primary" className="w-full" onClick={onAcceptDetection}>
                <Check size={12} /> Accept
              </Button>
              <Button variant="ghost" className="w-full" onClick={onRejectDetection}>
                <X size={12} /> Reject
              </Button>
            </div>
          </div>
        )}
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
                  <Square size={10} className="text-white/60" /> {element.type.toUpperCase()} #{element.id.toString().slice(-4)} {element.source === "auto-detected" ? "AI" : "MAN"}
                </div>
              ))}
              {obstacleMarkers.map((marker) => (
                <div
                  key={marker.id}
                  className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-lg flex items-center gap-2 tracking-wide font-mono border border-white/5"
                >
                  <Circle size={10} className="text-white/60" /> MKR #{marker.id.toString().slice(-4)} {marker.source === "auto-detected" ? "AI" : "MAN"}
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
  onAutoDetect,
  onAcceptDetection,
  onRejectDetection,
  isAutoDetecting,
  detectionPreview,
  detectionMessage,
  detectionConfidenceThreshold,
  onDetectionConfidenceThresholdChange,
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
          onAutoDetect={onAutoDetect}
          onAcceptDetection={onAcceptDetection}
          onRejectDetection={onRejectDetection}
          isAutoDetecting={isAutoDetecting}
          detectionPreview={detectionPreview}
          detectionMessage={detectionMessage}
          detectionConfidenceThreshold={detectionConfidenceThreshold}
          onDetectionConfidenceThresholdChange={onDetectionConfidenceThresholdChange}
        />
      )}
    </div>
  );
}
