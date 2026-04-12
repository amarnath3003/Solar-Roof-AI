import React, { ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, DollarSign, Gauge, Home, Loader2, SunMedium, TrendingUp, Zap } from "lucide-react";
import { Card } from "@/components/ui/glass";
import { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import { PANEL_TYPES } from "@/lib/panelLayout";
import { PanelTypeId } from "@/types";

const SolarFinancialChart = lazy(() => import("@/components/SolarFinancialChart"));

type EditablePlannerField =
  | "monthlyUsageKwh"
  | "panelCapacityWatts"
  | "energyCostPerKwh"
  | "costPerWatt"
  | "federalTaxCreditPct";

type PlannerSyncState = "estimate" | "paused" | "syncing" | "synced" | "error";

type SolarFinancialDashboardProps = {
  inputs: SolarFinancialInputs;
  financials: SolarFinancialResults;
  panelTypeId: PanelTypeId;
  placedPanelCount: number;
  syncState: PlannerSyncState;
  syncMessage: string;
  onInputChange: (field: EditablePlannerField, value: number, min: number, max: number) => void;
  onReset: () => void;
};

type SliderFieldProps = {
  label: string;
  description: string;
  field: EditablePlannerField;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  accentClassName: string;
  onChange: (field: EditablePlannerField, value: number, min: number, max: number) => void;
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absoluteValue >= 1_000_000) {
    return `${sign}$${formatNumber(absoluteValue / 1_000_000, 1)}M`;
  }

  if (absoluteValue >= 1_000) {
    return `${sign}$${formatNumber(absoluteValue / 1_000, 1)}K`;
  }

  return `${sign}$${formatNumber(absoluteValue, 0)}`;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const updateSize = (width: number, height: number) => {
      setSize({
        width: Math.max(0, Math.round(width)),
        height: Math.max(0, Math.round(height)),
      });
    };

    updateSize(node.clientWidth, node.clientHeight);

    if (typeof ResizeObserver === "undefined") {
      const frame = window.setInterval(() => {
        updateSize(node.clientWidth, node.clientHeight);
      }, 250);

      return () => window.clearInterval(frame);
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, size };
}

class ChartRegionErrorBoundary extends React.Component<
  {
    children: ReactNode;
    fallback: ReactNode;
  },
  { hasError: boolean }
> {
  state = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Solar planner chart render failed.", error, errorInfo);
    }
  }

  componentDidUpdate(previousProps: Readonly<{ children: ReactNode; fallback: ReactNode }>) {
    if (this.state.hasError && previousProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function SliderField({
  label,
  description,
  field,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  accentClassName,
  onChange,
}: SliderFieldProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">{label}</div>
          <div className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</div>
        </div>
        <div className="w-32">
          <label className="sr-only" htmlFor={`solar-field-${field}`}>
            {label}
          </label>
          <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right text-sm text-white">
            <span className="text-zinc-500">{prefix}</span>
            <input
              id={`solar-field-${field}`}
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                if (Number.isNaN(parsed)) {
                  return;
                }

                onChange(field, parsed, min, max);
              }}
              className="w-20 bg-transparent text-right outline-none"
            />
            <span className="text-zinc-500">{suffix}</span>
          </div>
        </div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(field, Number(event.target.value), min, max)}
        className={`mt-4 w-full ${accentClassName}`}
      />

      <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-zinc-500">
        <span>
          {prefix}
          {min}
          {suffix}
        </span>
        <span>
          {prefix}
          {max}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/25 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">{label}</div>
          <div className="mt-2 text-2xl font-light text-white">{value}</div>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${tone}`}>{icon}</div>
      </div>
      <div className="mt-3 text-xs leading-relaxed text-zinc-400">{detail}</div>
    </div>
  );
}

function ChartFallbackSummary({
  financials,
  isLoading = false,
}: {
  financials: SolarFinancialResults;
  isLoading?: boolean;
}) {
  return (
    <div className="grid h-full gap-3 content-start sm:grid-cols-3">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {isLoading ? <Loader2 size={12} className="animate-spin text-emerald-200" /> : <TrendingUp size={12} />}
          Year 20 Without Solar
        </div>
        <div className="mt-3 text-lg text-white">
          {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithoutSolar)}
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Year 20 With Solar</div>
        <div className="mt-3 text-lg text-white">
          {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithSolar)}
        </div>
      </div>
      <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/75">Break-even</div>
        <div className="mt-3 text-lg text-white">
          {financials.breakEvenYear ? `Year ${financials.breakEvenYear}` : "Beyond 20 years"}
        </div>
      </div>
    </div>
  );
}

function SyncStrip({
  syncState,
  syncMessage,
}: {
  syncState: PlannerSyncState;
  syncMessage: string;
}) {
  const tone = useMemo(() => {
    switch (syncState) {
      case "synced":
        return "border-emerald-300/20 bg-emerald-500/10 text-emerald-100";
      case "syncing":
        return "border-sky-300/20 bg-sky-500/10 text-sky-100";
      case "paused":
        return "border-amber-300/20 bg-amber-500/10 text-amber-100";
      case "error":
        return "border-red-300/20 bg-red-500/10 text-red-100";
      default:
        return "border-white/10 bg-white/5 text-zinc-200";
    }
  }, [syncState]);

  return (
    <div className={`rounded-[1.5rem] border px-4 py-3 ${tone}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">Planner Sync</div>
      <div className="mt-2 text-sm leading-relaxed">{syncMessage}</div>
    </div>
  );
}

export function SolarFinancialDashboard({
  inputs,
  financials,
  panelTypeId,
  placedPanelCount,
  syncState,
  syncMessage,
  onInputChange,
  onReset,
}: SolarFinancialDashboardProps) {
  const { ref: chartRef, size: chartSize } = useElementSize<HTMLDivElement>();
  const panelType = PANEL_TYPES[panelTypeId];
  const canRenderChart =
    chartSize.width > 60 && chartSize.height > 60 && financials.financialProjection.length > 0;
  const chartFallback = <ChartFallbackSummary financials={financials} />;

  return (
    <Card className="overflow-hidden rounded-[2rem] border-white/15 p-0">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(34,197,94,0.08),rgba(0,0,0,0.18))] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-cyan-200/85">Planning Studio</div>
            <h2 className="mt-2 text-xl font-medium tracking-[0.08em] text-white sm:text-2xl">
              Roof-Aware Financial Planner
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
              Size the system from monthly energy demand, compare long-term utility costs, and let the roof geometry
              drive the live panel recommendation.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-200">
              Footprint: {panelType.label}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.16em] text-zinc-200 transition hover:bg-white/10"
            >
              Reset Defaults
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-white/10 bg-white/[0.02] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-6">
            <section>
              <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-200">Target Demand</div>
              <div className="mt-3 space-y-3">
                <SliderField
                  label="Monthly Usage"
                  description="Primary planning target in kWh per month. Enter 500 here to plan around a 500 kWh monthly load."
                  field="monthlyUsageKwh"
                  value={inputs.monthlyUsageKwh}
                  min={100}
                  max={2500}
                  step={10}
                  suffix=" kWh/mo"
                  accentClassName="accent-cyan-400"
                  onChange={onInputChange}
                />
              </div>
            </section>

            <section>
              <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200">Financial Assumptions</div>
              <div className="mt-3 space-y-3">
                <SliderField
                  label="Panel Wattage"
                  description="Electrical output assumption for each module. Footprint still follows the selected panel type."
                  field="panelCapacityWatts"
                  value={inputs.panelCapacityWatts}
                  min={300}
                  max={550}
                  step={5}
                  suffix=" W"
                  accentClassName="accent-sky-400"
                  onChange={onInputChange}
                />
                <SliderField
                  label="Utility Rate"
                  description="Local grid price used for bill conversion and 20-year utility inflation."
                  field="energyCostPerKwh"
                  value={inputs.energyCostPerKwh}
                  min={0.08}
                  max={0.4}
                  step={0.01}
                  prefix="$"
                  suffix="/kWh"
                  accentClassName="accent-amber-400"
                  onChange={onInputChange}
                />
                <SliderField
                  label="Install Cost"
                  description="Gross install cost per watt before incentives are applied."
                  field="costPerWatt"
                  value={inputs.costPerWatt}
                  min={1.5}
                  max={6}
                  step={0.05}
                  prefix="$"
                  suffix="/W"
                  accentClassName="accent-orange-400"
                  onChange={onInputChange}
                />
                <SliderField
                  label="Federal ITC"
                  description="Federal tax credit percentage used against gross installation cost."
                  field="federalTaxCreditPct"
                  value={inputs.federalTaxCreditPct}
                  min={0}
                  max={40}
                  step={1}
                  suffix="%"
                  accentClassName="accent-lime-400"
                  onChange={onInputChange}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-100">Equivalent Bill Snapshot</div>
              <div className="mt-3 text-3xl font-light text-white">{formatCurrency(financials.estimatedMonthlyBill)}</div>
              <p className="mt-2 text-sm leading-relaxed text-emerald-50/75">
                Based on {formatNumber(inputs.monthlyUsageKwh, 0)} kWh/month at {formatCurrency(inputs.energyCostPerKwh)}
                /kWh.
              </p>
            </section>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
            <InsightCard
              icon={<Gauge size={18} className="text-cyan-100" />}
              label="Target Panels"
              value={`${financials.targetPanelCount}`}
              detail={`${formatNumber(financials.targetSystemSizeKw)} kW needed to offset the requested load before roof limits.`}
              tone="border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
            />
            <InsightCard
              icon={<Home size={18} className="text-amber-100" />}
              label="Roof Fit Max"
              value={financials.roofMaxPanelCount === null ? "Estimate" : `${financials.roofMaxPanelCount}`}
              detail={
                financials.roofMaxPanelCount === null
                  ? "Draw a primary roof to replace the estimate with real roof-fit capacity."
                  : `Best-fit capacity for the ${panelType.label.toLowerCase()} footprint.`
              }
              tone="border-amber-300/25 bg-amber-400/10 text-amber-100"
            />
            <InsightCard
              icon={<Zap size={18} className="text-sky-100" />}
              label="Recommended Pack"
              value={`${financials.recommendedPanelCount}`}
              detail={`Currently packed ${placedPanelCount} panel(s) with live sync ${syncState === "paused" ? "paused" : "available"}.`}
              tone="border-sky-300/25 bg-sky-400/10 text-sky-100"
            />
            <InsightCard
              icon={<SunMedium size={18} className="text-emerald-100" />}
              label="Coverage"
              value={`${formatNumber(financials.energyCoveredPercent)}%`}
              detail={`${formatNumber(financials.recommendedYearlyProductionKwh, 0)} kWh/year from the feasible layout.`}
              tone="border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
            />
            <InsightCard
              icon={<TrendingUp size={18} className="text-rose-100" />}
              label="Shortfall"
              value={
                financials.monthlyShortfallKwh > 0
                  ? `${formatNumber(financials.monthlyShortfallKwh, 0)} kWh/mo`
                  : "Covered"
              }
              detail={
                financials.roofLimited
                  ? "Roof-limited demand that stays on-grid after packing the feasible maximum."
                  : "The recommended system meets the target demand within the model assumptions."
              }
              tone="border-rose-300/25 bg-rose-400/10 text-rose-100"
            />
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.38fr)]">
            <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">20-Year Projection</div>
                  <div className="mt-1 text-lg text-white">Cumulative utility cost with the recommended layout</div>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-300">
                  {financials.breakEvenYear ? `Break-even year ${financials.breakEvenYear}` : "No break-even in 20 years"}
                </div>
              </div>

              <div ref={chartRef} className="mt-5 h-[320px] w-full">
                <ChartRegionErrorBoundary fallback={chartFallback}>
                  {canRenderChart ? (
                    <Suspense fallback={<ChartFallbackSummary financials={financials} isLoading />}>
                      <SolarFinancialChart
                        data={financials.financialProjection}
                        breakEvenYear={financials.breakEvenYear}
                        width={chartSize.width}
                        height={chartSize.height}
                      />
                    </Suspense>
                  ) : (
                    chartFallback
                  )}
                </ChartRegionErrorBoundary>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[1.75rem] border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(34,197,94,0.18),rgba(6,95,70,0.08),rgba(0,0,0,0.18))] p-5">
                <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/85">Total 20-Year Savings</div>
                <div className="mt-3 text-3xl font-light text-emerald-100 sm:text-4xl">
                  {formatCurrency(financials.totalTwentyYearSavings)}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-emerald-50/75">
                  Based on {financials.recommendedPanelCount} recommended panel(s), {formatNumber(financials.recommendedSystemSizeKw)}
                  {" "}kW system size, and the current financial assumptions.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-white/10 bg-black/20 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Net Install Cost</div>
                    <div className="mt-2 text-xl text-white">{formatCurrency(financials.netInstallationCost)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Federal Incentives</div>
                    <div className="mt-2 text-xl text-white">{formatCurrency(financials.incentives)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Without Solar @ Year 20</div>
                    <div className="mt-2 text-white">
                      {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithoutSolar)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">With Solar @ Year 20</div>
                    <div className="mt-2 text-white">
                      {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithSolar)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
            <SyncStrip syncState={syncState} syncMessage={syncMessage} />

            <div className="rounded-[1.5rem] border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Planner Notes</div>
              <div className="mt-2 text-sm leading-relaxed text-zinc-300">
                {financials.roofMaxPanelCount === null
                  ? `Working in estimate mode. Draw a roof to verify whether ${financials.targetPanelCount} panel(s) will actually fit.`
                  : financials.roofLimited
                    ? `Roof capacity tops out at ${financials.roofMaxPanelCount} panel(s), so about ${formatNumber(
                        financials.monthlyShortfallKwh,
                        0
                      )} kWh/month remains on-grid.`
                    : `The current roof can support the target with ${financials.recommendedPanelCount} panel(s), covering about ${formatNumber(
                        financials.energyCoveredDisplayPercent,
                        0
                      )}% of annual demand.`}
              </div>
            </div>
          </div>

          {syncState === "error" ? (
            <div className="mt-4 rounded-[1.5rem] border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                Planner sync encountered an issue. The numeric model is still available while map packing retries are paused.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
