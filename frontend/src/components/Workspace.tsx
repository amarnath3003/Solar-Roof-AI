import React from "react";
import { Bot, Check, Circle, Download, Layers, Loader2, Monitor, Ruler, Search, Square, Trash2, X } from "lucide-react";
import { Map } from "@/components/ui/map";
import { Button, Card } from "@/components/ui/glass";
import { SolarHeatmap } from "@/lib/solarHeatmap";
import { SunProjection, SunProjectionSeason, getSunSeasonLabel } from "@/lib/sunProjection";
import { AutoRoofDetectionResult, Coordinates, ObstacleMarker, RoofAreaSummary, RoofElement, ViewMode } from "@/types";

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
  onCalculateSqFt: () => void;
  onAcceptDetection: () => void;
  onRejectDetection: () => void;
  isAutoDetecting: boolean;
  detectionPreview: AutoRoofDetectionResult | null;
  detectionMessage: string | null;
  roofAreaSummary: RoofAreaSummary | null;
  roofAreaMessage: string | null;
  detectionConfidenceThreshold: number;
  onDetectionConfidenceThresholdChange: (next: number) => void;
  showSunPathControls: boolean;
  sunProjection: SunProjection | null;
  sunTimeOfDay: number;
  onSunTimeOfDayChange: (next: number) => void;
  sunSeason: SunProjectionSeason;
  onSunSeasonChange: (next: SunProjectionSeason) => void;
  solarHeatmap: SolarHeatmap | null;
};

function formatSqFt(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function formatDegrees(value: number) {
  return `${value.toFixed(1)}deg`;
}

function SunPathProjectionPanel({
  sunProjection,
  sunTimeOfDay,
  onSunTimeOfDayChange,
  sunSeason,
  onSunSeasonChange,
  solarHeatmap,
}: {
  sunProjection: SunProjection;
  sunTimeOfDay: number;
  onSunTimeOfDayChange: (next: number) => void;
  sunSeason: SunProjectionSeason;
  onSunSeasonChange: (next: SunProjectionSeason) => void;
  solarHeatmap: SolarHeatmap | null;
}) {
  const seasons: SunProjectionSeason[] = ["summer-solstice", "winter-solstice"];

  return (
    <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 p-4 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-[0.15em] text-amber-200">Sun Path Projection</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-amber-100/70 leading-relaxed">
            Live azimuth ray from the latest roof footprint center
          </div>
        </div>
        <div className="rounded-full border border-amber-200/20 bg-black/30 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-amber-100">
          {sunProjection.timeLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {seasons.map((season) => {
          const selected = sunSeason === season;
          return (
            <button
              key={season}
              type="button"
              onClick={() => onSunSeasonChange(season)}
              className={`rounded-xl border px-3 py-2 text-[10px] uppercase tracking-[0.14em] transition-colors ${
                selected
                  ? "border-amber-200/40 bg-amber-200/15 text-amber-50"
                  : "border-white/10 bg-black/20 text-zinc-300 hover:border-amber-200/20 hover:text-amber-100"
              }`}
            >
              {getSunSeasonLabel(season)}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-zinc-300">
          <span>Time of Day</span>
          <span>{sunProjection.timeLabel}</span>
        </div>
        <input
          type="range"
          min={6}
          max={18}
          step={0.25}
          value={sunTimeOfDay}
          onChange={(event) => onSunTimeOfDayChange(Number(event.target.value))}
          className="w-full accent-amber-300"
        />
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-zinc-500">
          <span>6:00 AM</span>
          <span>12:00 PM</span>
          <span>6:00 PM</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Azimuth</div>
          <div className="text-sm text-white">{formatDegrees(sunProjection.azimuthDegrees)}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Altitude</div>
          <div className="text-sm text-white">{formatDegrees(sunProjection.altitudeDegrees)}</div>
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-[0.14em] text-amber-100/75 leading-relaxed">
        {sunProjection.isAboveHorizon
          ? `Ray extends 50 m toward ${Math.round(sunProjection.azimuthDegrees)}deg for the selected solstice snapshot.`
          : "Sun is below the horizon for this snapshot. The ray remains visible as a directional cue."}
      </div>

      {solarHeatmap && (
        <div className="rounded-xl border border-white/10 bg-black/25 p-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-300">Daily Solar Heat Map</div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-lime-200">{solarHeatmap.bestZoneLabel}</div>
          </div>
          <div className="h-2 rounded-full bg-gradient-to-r from-blue-700 via-amber-400 to-lime-400" />
          <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-zinc-500">
            <span>Less Sun Time</span>
            <span>More Sun Time</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Average Exposure</div>
              <div className="text-sm text-white">{solarHeatmap.averageExposurePercent}%</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Best Cells</div>
              <div className="text-sm text-white">{solarHeatmap.peakExposurePercent}%</div>
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-amber-100/75 leading-relaxed">
            Heat colors accumulate unshadowed sunlight across the full {getSunSeasonLabel(sunSeason).toLowerCase()}
            {" "}day. The time slider still previews the live sun direction ray.
          </div>
          {solarHeatmap.isUniform && (
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 leading-relaxed">
              Exposure is fairly even across this roof with the current footprint and obstacle data.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

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
  onCalculateSqFt,
  onAcceptDetection,
  onRejectDetection,
  isAutoDetecting,
  detectionPreview,
  detectionMessage,
  roofAreaSummary,
  roofAreaMessage,
  detectionConfidenceThreshold,
  onDetectionConfidenceThresholdChange,
  showSunPathControls,
  sunProjection,
  sunTimeOfDay,
  onSunTimeOfDayChange,
  sunSeason,
  onSunSeasonChange,
  solarHeatmap,
}: {
  roofElements: RoofElement[];
  obstacleMarkers: ObstacleMarker[];
  onClearAll: () => void;
  onExport: () => void;
  onAutoDetect: () => void;
  onCalculateSqFt: () => void;
  onAcceptDetection: () => void;
  onRejectDetection: () => void;
  isAutoDetecting: boolean;
  detectionPreview: AutoRoofDetectionResult | null;
  detectionMessage: string | null;
  roofAreaSummary: RoofAreaSummary | null;
  roofAreaMessage: string | null;
  detectionConfidenceThreshold: number;
  onDetectionConfidenceThresholdChange: (next: number) => void;
  showSunPathControls: boolean;
  sunProjection: SunProjection | null;
  sunTimeOfDay: number;
  onSunTimeOfDayChange: (next: number) => void;
  sunSeason: SunProjectionSeason;
  onSunSeasonChange: (next: SunProjectionSeason) => void;
  solarHeatmap: SolarHeatmap | null;
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
          <Button variant="outline" className="w-full" onClick={onCalculateSqFt}>
            <Ruler size={14} /> Calc Sq Ft
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

        {showSunPathControls && sunProjection && (
          <SunPathProjectionPanel
            sunProjection={sunProjection}
            sunTimeOfDay={sunTimeOfDay}
            onSunTimeOfDayChange={onSunTimeOfDayChange}
            sunSeason={sunSeason}
            onSunSeasonChange={onSunSeasonChange}
            solarHeatmap={solarHeatmap}
          />
        )}

        {(roofAreaSummary || roofAreaMessage) && (
          <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 flex flex-col gap-3">
            <div className="text-[10px] uppercase tracking-[0.15em] text-emerald-200">Solar Surface Area</div>
            {roofAreaSummary && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Gross</div>
                    <div className="text-sm text-white">{formatSqFt(roofAreaSummary.grossSqFt)} sq ft</div>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Blocked</div>
                    <div className="text-sm text-white">{formatSqFt(roofAreaSummary.blockedSqFt)} sq ft</div>
                  </div>
                  <div className="rounded-xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-2">
                    <div className="text-[9px] uppercase tracking-[0.14em] text-emerald-200">Net</div>
                    <div className="text-sm text-white">{formatSqFt(roofAreaSummary.netSqFt)} sq ft</div>
                  </div>
                </div>
                <div className="text-[10px] text-emerald-100/80 uppercase tracking-wider leading-relaxed">
                  {roofAreaSummary.roofShapeCount} roof outline(s) measured with a {roofAreaSummary.obstacleClearanceFeet} ft
                  {" "}clearance around {roofAreaSummary.obstacleCount} obstacle(s).
                </div>
              </>
            )}
            {roofAreaMessage && (
              <div className="text-[10px] text-emerald-100/80 uppercase tracking-wider leading-relaxed">
                {roofAreaMessage}
              </div>
            )}
          </div>
        )}

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
  onCalculateSqFt,
  onAcceptDetection,
  onRejectDetection,
  isAutoDetecting,
  detectionPreview,
  detectionMessage,
  roofAreaSummary,
  roofAreaMessage,
  detectionConfidenceThreshold,
  onDetectionConfidenceThresholdChange,
  showSunPathControls,
  sunProjection,
  sunTimeOfDay,
  onSunTimeOfDayChange,
  sunSeason,
  onSunSeasonChange,
  solarHeatmap,
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
          onCalculateSqFt={onCalculateSqFt}
          onAcceptDetection={onAcceptDetection}
          onRejectDetection={onRejectDetection}
          isAutoDetecting={isAutoDetecting}
          detectionPreview={detectionPreview}
          detectionMessage={detectionMessage}
          roofAreaSummary={roofAreaSummary}
          roofAreaMessage={roofAreaMessage}
          detectionConfidenceThreshold={detectionConfidenceThreshold}
          onDetectionConfidenceThresholdChange={onDetectionConfidenceThresholdChange}
          showSunPathControls={showSunPathControls}
          sunProjection={sunProjection}
          sunTimeOfDay={sunTimeOfDay}
          onSunTimeOfDayChange={onSunTimeOfDayChange}
          sunSeason={sunSeason}
          onSunSeasonChange={onSunSeasonChange}
          solarHeatmap={solarHeatmap}
        />
      )}
    </div>
  );
}
