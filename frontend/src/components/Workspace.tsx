import React from "react";
import { Bot, Check, Circle, Download, Layers, Loader2, Monitor, Ruler, Search, Square, Trash2, X } from "lucide-react";
import { Map } from "@/components/ui/map";
import { Button, Card } from "@/components/ui/glass";
import { PANEL_TYPES } from "@/lib/panelLayout";
import { SolarHeatmap } from "@/lib/solarHeatmap";
import {
  AutoRoofDetectionResult,
  Coordinates,
  ObstacleMarker,
  PanelLayoutMode,
  PanelTypeId,
  RoofAreaSummary,
  RoofElement,
  ViewMode,
} from "@/types";

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
  solarOverlayEnabled: boolean;
  solarHeatmap: SolarHeatmap | null;
  panelTypeId: PanelTypeId;
  onPanelTypeChange: (next: PanelTypeId) => void;
  panelLayoutMode: PanelLayoutMode;
  onPanelLayoutModeChange: (next: PanelLayoutMode) => void;
  autoPackPanelLimit: number;
  onAutoPackPanelLimitChange: (next: number) => void;
  onAutoPackPanels: () => void;
  onClearPanels: () => void;
  placedPanelCount: number;
  estimatedPanelKw: number;
  panelLayoutMessage: string | null;
  exclusionZoneCount: number;
  hasPrimaryRoof: boolean;
};

type PanelLayoutPanelProps = {
  panelTypeId: PanelTypeId;
  onPanelTypeChange: (next: PanelTypeId) => void;
  panelLayoutMode: PanelLayoutMode;
  onPanelLayoutModeChange: (next: PanelLayoutMode) => void;
  autoPackPanelLimit: number;
  onAutoPackPanelLimitChange: (next: number) => void;
  onAutoPackPanels: () => void;
  onClearPanels: () => void;
  placedPanelCount: number;
  estimatedPanelKw: number;
  panelLayoutMessage: string | null;
  exclusionZoneCount: number;
  hasPrimaryRoof: boolean;
};

type WorkspaceDataPanelProps = {
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
  solarOverlayEnabled: boolean;
  solarHeatmap: SolarHeatmap | null;
  panelTypeId: PanelTypeId;
  onPanelTypeChange: (next: PanelTypeId) => void;
  panelLayoutMode: PanelLayoutMode;
  onPanelLayoutModeChange: (next: PanelLayoutMode) => void;
  autoPackPanelLimit: number;
  onAutoPackPanelLimitChange: (next: number) => void;
  onAutoPackPanels: () => void;
  onClearPanels: () => void;
  placedPanelCount: number;
  estimatedPanelKw: number;
  panelLayoutMessage: string | null;
  exclusionZoneCount: number;
  hasPrimaryRoof: boolean;
};

function formatSqFt(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  }).format(value);
}

function SectionTitle({ icon, title, detail }: { icon: React.ReactNode; title: string; detail?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-zinc-300">
        {icon}
        <span>{title}</span>
      </div>
      {detail ? <span className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">{detail}</span> : null}
    </div>
  );
}

function SolarOverlayPanel({ solarHeatmap }: { solarHeatmap: SolarHeatmap }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-amber-300/20 bg-amber-400/10 p-4">
      <SectionTitle icon={<Layers size={14} className="text-amber-200" />} title="Solar View" detail={solarHeatmap.bestZoneLabel} />
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="h-2 rounded-full bg-gradient-to-r from-sky-700 via-amber-400 to-lime-400" />
        <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-zinc-500">
          <span>Lower suitability</span>
          <span>Higher suitability</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Average score</div>
            <div className="mt-1 text-lg text-white">{solarHeatmap.averageExposurePercent}%</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
            <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Best zone</div>
            <div className="mt-1 text-lg text-white">{solarHeatmap.peakExposurePercent}%</div>
          </div>
        </div>
        <p className="mt-4 text-[10px] uppercase tracking-[0.14em] text-amber-100/75 leading-relaxed">
          Gradient blends sun duration, seasonal sweep, and obstacle shadows into one planning overlay.
        </p>
        {solarHeatmap.isUniform && (
          <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400 leading-relaxed">
            This roof reads fairly even, so the overlay stays intentionally soft.
          </p>
        )}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Card className="flex w-full max-w-2xl flex-col items-center gap-8 px-8 py-12 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/10 bg-white/5 shadow-[0_0_40px_rgba(255,255,255,0.05)]">
          <Search size={34} className="text-white/40" />
          <div className="absolute inset-0 rounded-[2rem] border border-white/20 opacity-20 animate-ping" />
        </div>
        <div className="space-y-3">
          <h2 className="text-xl font-medium text-white tracking-[0.15em] uppercase">Search For A Roof</h2>
          <p className="mx-auto max-w-lg text-sm leading-relaxed text-zinc-500">
            The map workspace opens after you pick an address from the top search bar. Once selected, the roof stays
            centered and the inspector can slide in without stealing layout space.
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
    <Card className="relative flex-1 overflow-hidden rounded-[2rem] border-white/15 p-0 shadow-2xl">
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

function PanelLayoutPanel({
  panelTypeId,
  onPanelTypeChange,
  panelLayoutMode,
  onPanelLayoutModeChange,
  autoPackPanelLimit,
  onAutoPackPanelLimitChange,
  onAutoPackPanels,
  onClearPanels,
  placedPanelCount,
  estimatedPanelKw,
  panelLayoutMessage,
  exclusionZoneCount,
  hasPrimaryRoof,
}: PanelLayoutPanelProps) {
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
      <SectionTitle icon={<Square size={14} className="text-white" />} title="Panel Layout" />

      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-zinc-400">Panel type</div>
        <select
          value={panelTypeId}
          onChange={(event) => onPanelTypeChange(event.target.value as PanelTypeId)}
          className="h-11 w-full rounded-xl border border-white/10 bg-black/25 px-4 text-sm text-white outline-none transition focus:border-cyan-300/40"
        >
          {Object.values(PANEL_TYPES).map((panelType) => (
            <option key={panelType.id} value={panelType.id} className="bg-zinc-950 text-white">
              {panelType.label} ({panelType.heightM}m x {panelType.widthM}m)
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Placement mode</div>
          <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-200">
            {panelLayoutMode === "manual" ? "Manual stamp" : "Auto-pack"}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-black/30 p-1">
          <button
            type="button"
            onClick={() => onPanelLayoutModeChange("manual")}
            className={`rounded-xl px-3 py-2 text-[10px] uppercase tracking-[0.14em] transition ${
              panelLayoutMode === "manual"
                ? "bg-emerald-400/20 text-emerald-100 border border-emerald-300/35"
                : "text-zinc-400 border border-transparent hover:text-white hover:bg-white/5"
            }`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => onPanelLayoutModeChange("auto")}
            className={`rounded-xl px-3 py-2 text-[10px] uppercase tracking-[0.14em] transition ${
              panelLayoutMode === "auto"
                ? "bg-cyan-400/20 text-cyan-100 border border-cyan-300/35"
                : "text-zinc-400 border border-transparent hover:text-white hover:bg-white/5"
            }`}
          >
            Auto
          </button>
        </div>
        <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-zinc-400 leading-relaxed">
          {panelLayoutMode === "manual"
            ? "Hover the roof in satellite view to preview each panel stamp before clicking to place it."
            : "Pack a grid inside the main roof while respecting edge setbacks and all exclusion shapes."}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-emerald-100">Max auto-pack panels</div>
          <div className="text-sm text-white">{autoPackPanelLimit}</div>
        </div>
        <input
          type="range"
          min={1}
          max={25}
          step={1}
          value={autoPackPanelLimit}
          onChange={(event) => onAutoPackPanelLimitChange(Number(event.target.value))}
          className="mt-3 w-full accent-emerald-400"
        />
        <div className="mt-3 text-[10px] uppercase tracking-[0.14em] text-emerald-100/75 leading-relaxed">
          Auto-pack will place up to this many panels and favor the greener solar cells first.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Total Panels Placed</div>
          <div className="mt-2 text-2xl font-light text-white">{placedPanelCount}</div>
        </div>
        <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-sky-200">Estimated kW</div>
          <div className="mt-2 text-2xl font-light text-white">{estimatedPanelKw.toFixed(1)}</div>
        </div>
      </div>

      <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 leading-relaxed">
        {hasPrimaryRoof
          ? `Primary roof ready with ${exclusionZoneCount} exclusion zone(s) intersecting it.`
          : "Draw one main roof polygon first, then add smaller inner lines or shapes to create exclusion zones."}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="primary" className="h-9 w-full" onClick={onAutoPackPanels} disabled={!hasPrimaryRoof}>
          <Square size={14} /> Auto-Pack Panels
        </Button>
        <Button
          variant="ghost"
          className="h-9 w-full border border-transparent hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300 text-red-400"
          onClick={onClearPanels}
          disabled={placedPanelCount === 0}
        >
          <Trash2 size={14} /> Clear Panels
        </Button>
      </div>

      {panelLayoutMessage && (
        <div className="rounded-2xl border border-sky-300/20 bg-sky-500/10 px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-sky-100 leading-relaxed">
          {panelLayoutMessage}
        </div>
      )}
    </section>
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
  solarOverlayEnabled,
  solarHeatmap,
  panelTypeId,
  onPanelTypeChange,
  panelLayoutMode,
  onPanelLayoutModeChange,
  autoPackPanelLimit,
  onAutoPackPanelLimitChange,
  onAutoPackPanels,
  onClearPanels,
  placedPanelCount,
  estimatedPanelKw,
  panelLayoutMessage,
  exclusionZoneCount,
  hasPrimaryRoof,
}: WorkspaceDataPanelProps) {
  return (
    <div className="mt-4 flex min-h-0 w-full shrink-0 animate-fade-in-up flex-col overflow-hidden lg:mt-0 lg:h-full lg:w-[19rem] xl:w-[20.5rem]">
      <Card className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-[2rem] border-white/15 p-0">
        <div className="border-b border-white/10 bg-black/30 px-4 py-4">
          <SectionTitle icon={<Layers size={14} className="text-white" />} title="Sidebar" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Shapes</div>
              <div className="mt-1 text-2xl font-light text-white">{roofElements.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Obstacles</div>
              <div className="mt-1 text-2xl font-light text-white">{obstacleMarkers.length}</div>
            </div>
          </div>
        </div>

        <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <SectionTitle icon={<Bot size={14} className="text-white" />} title="Automation" />
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Detection confidence</div>
                  <div className="text-xs text-zinc-200">{Math.round(detectionConfidenceThreshold * 100)}%</div>
                </div>
                <input
                  type="range"
                  min={30}
                  max={90}
                  step={5}
                  value={Math.round(detectionConfidenceThreshold * 100)}
                  onChange={(event) => onDetectionConfidenceThresholdChange(Number(event.target.value) / 100)}
                  className="mt-3 w-full accent-cyan-400"
                />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="primary" className="h-9 w-full" onClick={onAutoDetect} disabled={isAutoDetecting}>
                  {isAutoDetecting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Detecting...
                    </>
                  ) : (
                    <>
                      <Bot size={14} /> Auto Detect
                    </>
                  )}
                </Button>
                <Button variant="outline" className="h-9 w-full" onClick={onCalculateSqFt}>
                  <Ruler size={14} /> Calculate Area
                </Button>
                <Button variant="primary" className="h-9 w-full" onClick={onExport}>
                  <Download size={14} /> Export GeoJSON
                </Button>
                <Button
                  variant="ghost"
                  className="h-9 w-full border border-transparent text-red-400 hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-300"
                  onClick={onClearAll}
                >
                  <Trash2 size={14} /> Clear All
                </Button>
              </div>

              {detectionMessage && (
                <div className="rounded-2xl border border-white/15 bg-black/40 px-4 py-3 text-[10px] uppercase tracking-[0.12em] text-zinc-300 leading-relaxed">
                  {detectionMessage}
                </div>
              )}

              {detectionPreview && (
                <div className="rounded-2xl border border-cyan-400/40 bg-cyan-500/10 p-4">
                  <div className="text-[10px] uppercase tracking-[0.15em] text-cyan-200">Detection preview ready</div>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-cyan-100/80">
                    {detectionPreview.roofPlanes.length} roof plane(s), {detectionPreview.obstacles.length} obstacle(s)
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-cyan-100/80">
                    Model {detectionPreview.metadata.model} | {detectionPreview.metadata.processingMs}ms
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-cyan-100/80">
                    Filtered {detectionPreview.metadata.filteredRoofPlanes}/{detectionPreview.metadata.roofCandidates} roofs
                  </div>
                  {detectionPreview.metadata.warningCodes.length > 0 && (
                    <div className="mt-1 text-[10px] uppercase tracking-wider text-cyan-100/80">
                      Warnings: {detectionPreview.metadata.warningCodes.join(", ")}
                    </div>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Button variant="primary" className="w-full" onClick={onAcceptDetection}>
                      <Check size={12} /> Accept
                    </Button>
                    <Button variant="ghost" className="w-full" onClick={onRejectDetection}>
                      <X size={12} /> Reject
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {(roofAreaSummary || roofAreaMessage) && (
              <section className="flex flex-col gap-3 rounded-3xl border border-emerald-400/25 bg-emerald-500/10 p-3">
                <SectionTitle icon={<Ruler size={14} className="text-emerald-200" />} title="Solar Surface Area" />
                {roofAreaSummary && (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Gross</div>
                        <div className="mt-1 text-sm text-white">{formatSqFt(roofAreaSummary.grossSqFt)} sq ft</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-zinc-400">Blocked</div>
                        <div className="mt-1 text-sm text-white">{formatSqFt(roofAreaSummary.blockedSqFt)} sq ft</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-300/25 bg-emerald-500/10 px-3 py-3">
                        <div className="text-[9px] uppercase tracking-[0.14em] text-emerald-200">Net</div>
                        <div className="mt-1 text-sm text-white">{formatSqFt(roofAreaSummary.netSqFt)} sq ft</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-emerald-100/80 uppercase tracking-wider leading-relaxed">
                      {roofAreaSummary.roofShapeCount} roof outline(s) measured with a {roofAreaSummary.obstacleClearanceFeet} ft
                      {" "}clearance around {roofAreaSummary.obstacleCount} obstacle(s).
                    </div>
                  </>
                )}
                {roofAreaMessage && (
                  <div className="text-[10px] text-emerald-100/80 uppercase tracking-wider leading-relaxed">{roofAreaMessage}</div>
                )}
              </section>
            )}

            {solarOverlayEnabled && solarHeatmap && <SolarOverlayPanel solarHeatmap={solarHeatmap} />}

            <PanelLayoutPanel
              panelTypeId={panelTypeId}
              onPanelTypeChange={onPanelTypeChange}
              panelLayoutMode={panelLayoutMode}
              onPanelLayoutModeChange={onPanelLayoutModeChange}
              autoPackPanelLimit={autoPackPanelLimit}
              onAutoPackPanelLimitChange={onAutoPackPanelLimitChange}
              onAutoPackPanels={onAutoPackPanels}
              onClearPanels={onClearPanels}
              placedPanelCount={placedPanelCount}
              estimatedPanelKw={estimatedPanelKw}
              panelLayoutMessage={panelLayoutMessage}
              exclusionZoneCount={exclusionZoneCount}
              hasPrimaryRoof={hasPrimaryRoof}
            />

            <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3">
              <SectionTitle icon={<Monitor size={14} className="text-white" />} title="Activity Log" />
              <div className="custom-scrollbar max-h-64 overflow-y-auto rounded-2xl border border-white/5 bg-black/40 p-3">
                <div className="flex flex-col gap-3">
                  {roofElements.length === 0 && obstacleMarkers.length === 0 && placedPanelCount === 0 ? (
                    <div className="py-10 text-zinc-600 text-[10px] uppercase tracking-widest text-center">No entities drawn</div>
                  ) : (
                    <>
                      {roofElements.map((element) => (
                        <div
                          key={element.id}
                          className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-xl flex items-center gap-2 tracking-wide font-mono border border-white/5"
                        >
                          <Square size={10} className="text-white/60" /> {element.type.toUpperCase()} #{element.id.toString().slice(-4)} {element.source === "auto-detected" ? "AI" : "MAN"}
                        </div>
                      ))}
                      {obstacleMarkers.map((marker) => (
                        <div
                          key={marker.id}
                          className="text-[10px] text-zinc-300 bg-white/5 p-2 rounded-xl flex items-center gap-2 tracking-wide font-mono border border-white/5"
                        >
                          <Circle size={10} className="text-white/60" /> MKR #{marker.id.toString().slice(-4)} {marker.source === "auto-detected" ? "AI" : "MAN"}
                        </div>
                      ))}
                      {Array.from({ length: placedPanelCount }).map((_, index) => (
                        <div
                          key={`panel-${index}`}
                          className="text-[10px] text-zinc-300 bg-blue-500/10 p-2 rounded-xl flex items-center gap-2 tracking-wide font-mono border border-blue-300/15"
                        >
                          <Square size={10} className="text-blue-100/80" /> PNL #{(index + 1).toString().padStart(3, "0")}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>
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
  solarOverlayEnabled,
  solarHeatmap,
  panelTypeId,
  onPanelTypeChange,
  panelLayoutMode,
  onPanelLayoutModeChange,
  autoPackPanelLimit,
  onAutoPackPanelLimitChange,
  onAutoPackPanels,
  onClearPanels,
  placedPanelCount,
  estimatedPanelKw,
  panelLayoutMessage,
  exclusionZoneCount,
  hasPrimaryRoof,
}: WorkspaceContentProps) {
  if (!coordinates) {
    return <EmptyState />;
  }

  return (
    <div
      className={`flex-1 grid h-full min-h-0 grid-cols-1 gap-4 ${
        showMapTools ? "lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_20.5rem]" : ""
      } overflow-hidden items-stretch`}
    >
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
          solarOverlayEnabled={solarOverlayEnabled}
          solarHeatmap={solarHeatmap}
          panelTypeId={panelTypeId}
          onPanelTypeChange={onPanelTypeChange}
          panelLayoutMode={panelLayoutMode}
          onPanelLayoutModeChange={onPanelLayoutModeChange}
          autoPackPanelLimit={autoPackPanelLimit}
          onAutoPackPanelLimitChange={onAutoPackPanelLimitChange}
          onAutoPackPanels={onAutoPackPanels}
          onClearPanels={onClearPanels}
          placedPanelCount={placedPanelCount}
          estimatedPanelKw={estimatedPanelKw}
          panelLayoutMessage={panelLayoutMessage}
          exclusionZoneCount={exclusionZoneCount}
          hasPrimaryRoof={hasPrimaryRoof}
        />
      )}
    </div>
  );
}
