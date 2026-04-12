import React, { useState } from "react";
import { ChevronDown, ChevronUp, DollarSign, Info, RefreshCw } from "lucide-react";
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
  autoPackPanelLimit: number;
  onAutoPackPanelLimitChange: (limit: number) => void;
  onAutoPackPanels: () => void;
  onPanelTypeChange: (next: PanelTypeId) => void;
  panelLayoutMode: PanelLayoutMode;
  onPanelLayoutModeChange: (next: PanelLayoutMode) => void;
  onClearPanels: () => void;
  panelLayoutMessage: string | null;
}

function InputField({ label, field, value, min, max, step, prefix, suffix, onChange }: any) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">{label}</label>
      <div className="flex h-9 items-center rounded-xl border border-white/10 bg-black/25 px-3 text-sm text-white focus-within:border-cyan-300/40">
        {prefix && <span className="mr-1 text-zinc-500">{prefix}</span>}
        <input type="number" min={min} max={max} step={step} value={value} onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(field, n, min, max);
        }} className="w-full bg-transparent outline-none" />
        {suffix && <span className="ml-1 text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

export function FinancialSidebarPanel({ inputs, autoPackPanelLimit, onAutoPackPanelLimitChange, onAutoPackPanels, panelTypeId, onPanelTypeChange, panelLayoutMode, onPanelLayoutModeChange, onClearPanels, panelLayoutMessage, onInputChange, onReset }: FinancialSidebarPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 text-white">
      <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
          <DollarSign size={14} /><span>Solar Potential Analysis</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </div>
      {isExpanded && (
        <div className="mt-2 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3 flex items-center mb-2 gap-3">
            <Info className="text-violet-300 shrink-0" size={16} />
            <div className="flex-1 text-[10px] uppercase tracking-[0.14em] text-violet-200">Projections use a USA financial model</div>
            <button aria-label="Reset Defaults" onClick={onReset} className="text-xs text-violet-300 hover:text-violet-100 underline decoration-violet-500/50 underline-offset-4">Reset</button>
          </div>
          <div className="flex flex-col gap-4">
            <InputField label="Monthly average energy bill" field="monthlyBill" value={inputs.monthlyBill} min={50} max={600} step={1} prefix="$" onChange={onInputChange} />
            <div className="flex flex-col gap-1 pt-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 flex justify-between">
                <span>Panels count</span><span className="text-zinc-200">{autoPackPanelLimit} panels</span>
              </div>
              <div className="flex items-center gap-3">
                <input type="range" min={1} max={50} step={1} value={autoPackPanelLimit} onChange={(e) => onAutoPackPanelLimitChange(Number(e.target.value))} className="w-full accent-violet-400" />
                <button onClick={onAutoPackPanels} title="Auto-pack layout" className="p-1 bg-violet-500/20 hover:bg-violet-500/40 border border-violet-300/30 rounded-lg text-violet-200"><RefreshCw size={20} /></button>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 mb-1">Panel type</label>
              <select value={panelTypeId} onChange={(e) => onPanelTypeChange(e.target.value as PanelTypeId)} className="h-9 w-full rounded-xl border border-white/10 bg-black/25 px-3 text-sm outline-none">
                {Object.values(PANEL_TYPES).map(pt => <option key={pt.id} value={pt.id} className="bg-zinc-950 text-white">{pt.label} ({pt.heightM}m x {pt.widthM}m)</option>)}
              </select>
            </div>
            
            <div className="flex items-center justify-between gap-2">
              <div className="flex bg-black/30 rounded-xl p-1 w-full border border-white/5">
                <button
                  type="button"
                  onClick={() => onPanelLayoutModeChange("auto")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                    panelLayoutMode === "auto"
                      ? "bg-violet-400/20 text-violet-200 border border-violet-300/30"
                      : "text-zinc-500 border border-transparent hover:text-zinc-300"
                  }`}
                >Auto</button>
                <button
                  type="button"
                  onClick={() => onPanelLayoutModeChange("manual")}
                  className={`flex-1 rounded-lg px-2 py-1.5 text-[10px] uppercase tracking-[0.14em] transition ${
                    panelLayoutMode === "manual"
                      ? "bg-emerald-400/20 text-emerald-200 border border-emerald-300/30"
                      : "text-zinc-500 border border-transparent hover:text-zinc-300"
                  }`}
                >Manual</button>
              </div>
              <button 
                type="button" 
                onClick={onClearPanels} 
                className="shrink-0 h-[34px] px-3 rounded-xl border border-red-500/20 text-red-400 bg-red-500/10 hover:bg-red-500/20 text-[10px] uppercase tracking-[0.14em]"
              >Clear</button>
            </div>
            {panelLayoutMessage && (
              <div className="text-[10px] uppercase tracking-[0.12em] text-violet-200 bg-violet-500/20 p-2 rounded-xl -mt-2">
                {panelLayoutMessage}
              </div>
            )}
            
            <InputField label="Energy cost per kWh" field="energyCostPerKwh" value={inputs.energyCostPerKwh} min={0.08} max={0.45} step={0.01} prefix="$" onChange={onInputChange} />
            <InputField label="Solar incentives" field="solarIncentiveAmount" value={inputs.solarIncentiveAmount} min={0} max={15000} step={100} prefix="$" onChange={onInputChange} />
            <InputField label="Installation cost per Watt" field="costPerWatt" value={inputs.costPerWatt} min={1.5} max={6} step={0.05} prefix="$" onChange={onInputChange} />
            <InputField label="Panel capacity" field="panelCapacityWatts" value={inputs.panelCapacityWatts} min={300} max={550} step={5} suffix="Watts" onChange={onInputChange} />
          </div>
        </div>
      )}
    </section>
  );
}