import React, { Suspense, lazy, useState } from "react";
import { ChevronDown, ChevronUp, DollarSign, Gauge, Home, SunMedium } from "lucide-react";
import { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import { PanelTypeId } from "@/types";
import { PANEL_TYPES } from "@/lib/panelLayout";

const SolarFinancialChart = lazy(() => import("@/components/SolarFinancialChart"));

type EditablePlannerField =
  | "monthlyBill"
  | "panelCapacityWatts"
  | "energyCostPerKwh"
  | "costPerWatt"
  | "solarIncentiveAmount";

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
}

function formatCurrency(value: number) {
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

function formatWholeNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(value);
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
}) {
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
          value={value}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            if (!Number.isNaN(nextValue)) {
              onChange(field, nextValue, min, max);
            }
          }}
          className="w-full bg-transparent outline-none"
        />
        {suffix && <span className="ml-1 text-zinc-500">{suffix}</span>}
      </div>
    </div>
  );
}

function StatRow({ label, value, tone = "text-white" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`text-sm font-medium ${tone}`}>{value}</div>
    </div>
  );
}

export function FinancialSidebarPanel({
  inputs,
  financials,
  panelTypeId,
  placedPanelCount,
  onInputChange,
  onReset,
}: FinancialSidebarPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-3 text-white">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-violet-300">
          <DollarSign size={14} />
          <span>Solar Potential Analysis</span>
        </div>
        {isExpanded ? <ChevronUp size={16} className="text-zinc-500" /> : <ChevronDown size={16} className="text-zinc-500" />}
      </div>

      <div className="flex flex-col gap-2 mt-2">
        <StatRow
          label={
            <span className="flex items-center gap-2">
              <SunMedium size={14} className="text-violet-300" /> Yearly energy
            </span>
          }
          value={`${formatNumber(financials.yearlyEnergyKwh, 1)} kWh`}
        />
        <StatRow
          label={
            <span className="flex items-center gap-2">
              <Home size={14} className="text-sky-300" /> Installation size
            </span>
          }
          value={`${formatNumber(financials.installationSizeKw, 1)} kW`}
        />
        <StatRow
          label={
            <span className="flex items-center gap-2">
              <DollarSign size={14} className="text-amber-300" /> Installation cost
            </span>
          }
          value={formatCurrency(financials.netInstallationCost)}
        />
        <StatRow
          label={
            <span className="flex items-center gap-2">
              <Gauge size={14} className="text-emerald-300" /> Energy covered
            </span>
          }
          value={`${formatNumber(financials.energyCoveredPercent, 0)} %`}
        />
      </div>

      {isExpanded && (
        <div className="mt-4 flex flex-col gap-4 animate-in fade-in slide-in-from-top-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[12px] font-medium text-white mb-2">Cost analysis for 20 years</div>
            <div className="h-[180px] w-full mb-3">
              <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-zinc-500 text-xs">Loading chart...</div>}>
                <SolarFinancialChart
                  data={financials.financialProjection}
                  breakEvenCalendarYear={financials.breakEvenCalendarYear}
                  width={280}
                  height={180}
                />
              </Suspense>
            </div>
            <StatRow label="Cost without solar" value={formatCurrency(financials.costWithoutSolarTwentyYear)} />
            <StatRow label="Cost with solar" value={formatCurrency(financials.costWithSolarTwentyYear)} />
            <StatRow label="Savings" value={formatCurrency(financials.totalTwentyYearSavings)} tone="text-emerald-400" />
            <StatRow
              label="Break even"
              value={financials.breakEvenCalendarYear ? `${financials.breakEvenCalendarYear} in ${financials.breakEvenYear} yr` : "N/A"}
            />
          </div>

          <div className="rounded-2xl border border-violet-400/20 bg-violet-500/10 p-3">
            <div className="text-[10px] uppercase tracking-[0.14em] text-violet-200">
              Projections use a USA financial model
            </div>
            <button type="button" onClick={onReset} className="mt-2 text-xs text-violet-300 hover:text-violet-100 underline decoration-violet-500/50 underline-offset-4">
              Reset defaults
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <InputField
              label="Monthly average energy bill"
              field="monthlyBill"
              value={inputs.monthlyBill}
              min={50}
              max={600}
              step={1}
              prefix="$"
              onChange={onInputChange}
            />

            <div className="flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-400 flex justify-between">
                <span>Panels count</span>
                <span className="text-zinc-200">{financials.recommendedPanelCount} panels</span>
              </div>
              <input
                type="range"
                value={financials.recommendedPanelCount}
                max={Math.max(financials.recommendedPanelCount * 2, 50)}
                disabled
                className="w-full accent-violet-400 opacity-50"
              />
            </div>

            <InputField
              label="Energy cost per kWh"
              field="energyCostPerKwh"
              value={inputs.energyCostPerKwh}
              min={0.08}
              max={0.45}
              step={0.01}
              prefix="$"
              onChange={onInputChange}
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
            />

            <InputField
              label="Panel capacity"
              field="panelCapacityWatts"
              value={inputs.panelCapacityWatts}
              min={300}
              max={550}
              step={5}
              suffix="W"
              onChange={onInputChange}
            />
          </div>
        </div>
      )}
    </section>
  );
}
