import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, DollarSign, Info } from "lucide-react";
import { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import { PanelLayoutMode, PanelTypeId } from "@/types";
import { PANEL_TYPES } from "@/lib/panelLayout";

type EditablePlannerField = "monthlyBill" | "panelCapacityWatts" | "energyCostPerKwh" | "costPerWatt" | "solarIncentiveAmount";
type PlannerSyncState = "estimate" | "paused" | "syncing" | "synced" | "error";

interface FinancialSidebarPanelProps {
  inputs: SolarFinancialInputs;
  financials: SolarFinancialResults;
  panelTypeId: PanelTypeId;
  placedPanelCount: number;
  syncState: PlannerSyncState;
  syncMessage: string;
  onInputChange: (field: EditablePlannerField, value: number, min: number, max: number) => void;
  onReset: () => void;
  panelTargetCount: number;
  onPanelTargetCountChange: (limit: number) => void;
  onApplyBestMaximum: () => void;
  onPanelTypeChange: (next: PanelTypeId) => void;
  panelLayoutMode: PanelLayoutMode;
  onPanelLayoutModeChange: (next: PanelLayoutMode) => void;
  onClearPanels: () => void;
  panelLayoutMessage: string | null;
  isLocked: boolean;
  lockMessage: string;
}

function InputField({
  label,
  field,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  onChange,
  disabled,
}: {
  label: string;
  field: EditablePlannerField;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  onChange: (field: EditablePlannerField, value: number, min: number, max: number) => void;
  disabled?: boolean;
}) {
  const [draftValue, setDraftValue] = useState(String(value));

  React.useEffect(() => {
    setDraftValue(String(value));
  }, [value]);

  const commitValue = () => {
    const parsed = Number(draftValue);
    if (Number.isNaN(parsed)) {
      setDraftValue(String(value));
      return;
    }

    onChange(field, parsed, min, max);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{label}</label>
      <div className="flex h-9 items-center rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white focus-within:border-cyan-300/40">
        {prefix && <span className="mr-1 text-zinc-500">{prefix}</span>}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draftValue}
          disabled={disabled}
          onChange={(e) => {
            setDraftValue(e.target.value);
          }}
          onBlur={commitValue}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitValue();
              (event.target as HTMLInputElement).blur();
            }
          }}
          className="w-full bg-transparent outline-none disabled:cursor-not-allowed disabled:opacity-50"
        />
        {suffix && <span className="ml-1 text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

function getSyncTone(syncState: PlannerSyncState) {
  switch (syncState) {
    case "synced":
      return "border-cyan-300/20 bg-cyan-500/10 text-cyan-100";
    case "syncing":
      return "border-sky-300/20 bg-sky-500/10 text-sky-100";
    case "paused":
      return "border-zinc-300/20 bg-zinc-500/10 text-zinc-100";
    case "error":
      return "border-red-300/20 bg-red-500/10 text-red-100";
    default:
      return "border-white/10 bg-white/5 text-zinc-200";
  }
}

export function FinancialSidebarPanel({
  inputs,
  financials,
  panelTypeId,
  placedPanelCount,
  syncState,
  syncMessage,
  onInputChange,
  onReset,
  panelTargetCount,
  onPanelTargetCountChange,
  onApplyBestMaximum,
  onPanelTypeChange,
  panelLayoutMode,
  onPanelLayoutModeChange,
  onClearPanels,
  panelLayoutMessage,
  isLocked,
  lockMessage,
}: FinancialSidebarPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const roofMaxPanels = financials.roofMaxPanelCount ?? 0;
  const hasRoofCapacity = roofMaxPanels > 0;
  const sliderMax = Math.max(1, roofMaxPanels);
  const sliderValue = useMemo(() => {
    if (!hasRoofCapacity) {
      return 1;
    }

    return Math.min(Math.max(panelTargetCount, 1), sliderMax);
  }, [hasRoofCapacity, panelTargetCount, sliderMax]);

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 text-white">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-300">
          <DollarSign size={14} />
          <span>Solar Potential Analysis</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </div>

      {isExpanded && (
        <div className="mt-2 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
          {isLocked && (
            <div className="rounded-2xl border border-amber-300/30 bg-amber-500/10 p-3 text-[10px] uppercase tracking-[0.12em] text-amber-100 leading-relaxed">
              {lockMessage}
            </div>
          )}

          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-3 flex items-center mb-2 gap-3">
            <Info className="text-cyan-300 shrink-0" size={16} />
            <div className="flex-1 text-[10px] uppercase tracking-[0.14em] text-cyan-100">Projections use a USA financial model</div>
            <button
              aria-label="Reset Defaults"
              onClick={onReset}
              disabled={isLocked}
              className="text-xs text-cyan-300 hover:text-cyan-100 underline decoration-cyan-500/50 underline-offset-4 disabled:opacity-50"
            >
              Reset
            </button>
          </div>

          <div className={`rounded-2xl border px-3 py-3 text-[10px] uppercase tracking-[0.12em] leading-relaxed ${getSyncTone(syncState)}`}>
            {syncMessage}
          </div>

          <div className="flex flex-col gap-4">
            <InputField
              label="Monthly average energy bill"
              field="monthlyBill"
              value={inputs.monthlyBill}
              min={50}
              max={600}
              step={1}
              prefix="$"
              onChange={onInputChange}
              disabled={isLocked}
            />

            <div className="flex flex-col gap-1 pt-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 flex justify-between">
                <span>Panels count</span>
                <span className="text-zinc-200">{hasRoofCapacity ? sliderValue : 0} panels</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={sliderMax}
                  step={1}
                  value={sliderValue}
                  disabled={isLocked || !hasRoofCapacity}
                  onChange={(e) => onPanelTargetCountChange(Number(e.target.value))}
                  className="w-full accent-violet-400 disabled:opacity-40"
                />
                <button
                  type="button"
                  onClick={onApplyBestMaximum}
                  title="Find the best panel count for cost versus solar coverage"
                  disabled={isLocked || !hasRoofCapacity}
                  className="shrink-0 h-8 rounded-lg border border-cyan-300/30 bg-cyan-500/20 px-2 text-[10px] uppercase tracking-[0.12em] text-cyan-100 hover:bg-cyan-500/40 disabled:opacity-40"
                >
                  Best ROI
                </button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 leading-relaxed">
                Recommended {financials.recommendedPanelCount} | Roof max {hasRoofCapacity ? roofMaxPanels : 0} | Placed {placedPanelCount}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 mb-1">Panel type</label>
              <select
                value={panelTypeId}
                disabled={isLocked}
                onChange={(e) => onPanelTypeChange(e.target.value as PanelTypeId)}
                className="h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none disabled:opacity-50"
              >
                {Object.values(PANEL_TYPES).map((pt) => (
                  <option key={pt.id} value={pt.id} className="bg-zinc-950 text-white">
                    {pt.label} ({pt.heightM}m x {pt.widthM}m)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex bg-black/30 rounded-xl p-1 w-full border border-white/5">
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onPanelLayoutModeChange("auto")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                    panelLayoutMode === "auto"
                      ? "bg-cyan-400/20 text-cyan-200 border border-cyan-300/30"
                      : "text-zinc-500 border border-transparent hover:text-zinc-300"
                  } disabled:opacity-50`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  disabled={isLocked}
                  onClick={() => onPanelLayoutModeChange("manual")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                    panelLayoutMode === "manual"
                      ? "bg-cyan-400/20 text-cyan-200 border border-cyan-300/30"
                      : "text-zinc-500 border border-transparent hover:text-zinc-300"
                  } disabled:opacity-50`}
                >
                  Manual
                </button>
              </div>
              <button
                type="button"
                disabled={isLocked}
                onClick={onClearPanels}
                className="shrink-0 h-[34px] px-3 rounded-xl border border-red-500/20 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-[10px] uppercase tracking-[0.14em] disabled:opacity-50"
              >
                Clear
              </button>
            </div>

            {panelLayoutMessage && (
              <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-100 bg-cyan-500/20 p-2 rounded-xl -mt-2">
                {panelLayoutMessage}
              </div>
            )}

            <InputField
              label="Energy cost per kWh"
              field="energyCostPerKwh"
              value={inputs.energyCostPerKwh}
              min={0.08}
              max={0.45}
              step={0.01}
              prefix="$"
              onChange={onInputChange}
              disabled={isLocked}
            />
            <InputField
              label="Solar incentives"
              field="solarIncentiveAmount"
              value={inputs.solarIncentiveAmount}
              min={0}
              max={15000}
              step={100}
              prefix="$"
              onChange={onInputChange}
              disabled={isLocked}
            />
            <InputField
              label="Installation cost per Watt"
              field="costPerWatt"
              value={inputs.costPerWatt}
              min={1.5}
              max={6}
              step={0.05}
              prefix="$"
              onChange={onInputChange}
              disabled={isLocked}
            />
            <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-[10px] uppercase tracking-[0.12em] text-zinc-300">
              Capacity from panel type: {inputs.panelCapacityWatts}W
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
