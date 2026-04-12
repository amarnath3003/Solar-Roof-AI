import React, { ReactNode, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, DollarSign, Gauge, Home, Loader2, SunMedium, TrendingUp, Zap } from "lucide-react";
import { Card } from "@/components/ui/glass";
import { SolarFinancialInputs, SolarFinancialResults } from "@/hooks/useSolarFinancials";
import { PANEL_TYPES } from "@/lib/panelLayout";
import { PanelTypeId } from "@/types";

const SolarFinancialChart = lazy(() => import("@/components/SolarFinancialChart"));

type EditablePlannerField =
  | "monthlyBill"
  | "panelCapacityWatts"
  | "energyCostPerKwh"
  | "costPerWatt"
  | "solarIncentiveAmount";

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

type InputFieldProps = {
  label: string;
  field: EditablePlannerField;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  description: string;
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

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
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
      console.error("Solar potential chart render failed.", error, errorInfo);
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

function InputField({
  label,
  field,
  value,
  min,
  max,
  step,
  prefix,
  suffix,
  description,
  accentClassName,
  onChange,
}: InputFieldProps) {
  return (
    <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <label htmlFor={`solar-potential-${field}`} className="text-sm font-medium text-white">
          {label}
        </label>
        <div className="w-36 rounded-2xl border border-white/12 bg-black/20 px-3 py-2 text-right text-lg text-white">
          <span className="text-sm text-zinc-500">{prefix}</span>
          <input
            id={`solar-potential-${field}`}
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isNaN(nextValue)) {
                return;
              }

              onChange(field, nextValue, min, max);
            }}
            className="w-20 bg-transparent text-right outline-none"
          />
          <span className="ml-1 text-sm text-zinc-500">{suffix}</span>
        </div>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{description}</p>

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

function SummaryCard({
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
    <div className="rounded-[1.6rem] border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-400">{label}</div>
          <div className="mt-2 text-2xl font-light text-white">{value}</div>
        </div>
        <div className={`rounded-2xl border px-3 py-3 ${tone}`}>{icon}</div>
      </div>
      <div className="mt-3 text-xs leading-relaxed text-zinc-400">{detail}</div>
    </div>
  );
}

function StatRow({
  label,
  value,
  tone = "text-white",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-3">
      <div className="text-sm text-zinc-300">{label}</div>
      <div className={`text-right text-base font-medium ${tone}`}>{value}</div>
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
    <div className="grid h-full content-start gap-3 md:grid-cols-3">
      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          {isLoading ? <Loader2 size={12} className="animate-spin text-sky-200" /> : <TrendingUp size={12} />}
          No Solar
        </div>
        <div className="mt-3 text-lg text-white">{formatCurrency(financials.costWithoutSolarTwentyYear)}</div>
      </div>
      <div className="rounded-[1.2rem] border border-white/10 bg-black/20 p-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Solar</div>
        <div className="mt-3 text-lg text-white">{formatCurrency(financials.costWithSolarTwentyYear)}</div>
      </div>
      <div className="rounded-[1.2rem] border border-emerald-300/20 bg-emerald-500/10 p-4">
        <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-100/75">Break even</div>
        <div className="mt-3 text-lg text-white">
          {financials.breakEvenCalendarYear ? `${financials.breakEvenCalendarYear}` : "Beyond 20 years"}
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
    <div className={`rounded-[1.45rem] border px-4 py-3 ${tone}`}>
      <div className="text-[10px] uppercase tracking-[0.16em] opacity-80">Auto placement</div>
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
  const panelCoveragePercent =
    financials.targetPanelCount > 0
      ? clampPercent((financials.recommendedPanelCount / financials.targetPanelCount) * 100)
      : 0;
  const roofFitLabel =
    financials.roofMaxPanelCount === null ? "Draw a roof to verify fit" : `${financials.roofMaxPanelCount} roof-fit max`;
  const breakEvenLabel = financials.breakEvenCalendarYear
    ? `${financials.breakEvenCalendarYear} in ${financials.breakEvenYear} year${financials.breakEvenYear === 1 ? "" : "s"}`
    : "No break-even within 20 years";

  return (
    <Card className="overflow-hidden rounded-[2rem] border-white/15 p-0">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(109,40,217,0.18),rgba(14,165,233,0.10),rgba(255,255,255,0.02))] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-violet-200/85">Financial Model</div>
            <h2 className="mt-2 text-xl font-medium tracking-[0.06em] text-white sm:text-2xl">
              Solar Potential Analysis
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
              Enter your average monthly bill, keep or edit the current U.S. defaults, and the roof layout will size
              and auto-place a matching solar system as soon as a primary roof is available.
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
              Reset U.S. Defaults
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)]">
        <div className="border-b border-white/10 bg-white/[0.02] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-4">
            <div className="rounded-[1.45rem] border border-violet-300/20 bg-violet-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle size={16} className="mt-0.5 text-violet-200" />
                <div>
                  <div className="text-sm font-medium text-violet-100">U.S. baseline, editable</div>
                  <p className="mt-1 text-xs leading-relaxed text-violet-100/80">
                    Prefilled for April 2026 with a national utility-rate baseline, a 400W residential panel, and a
                    $0 default incentive so you can layer in local rebates if they apply.
                  </p>
                </div>
              </div>
            </div>

            <InputField
              label="Monthly average energy bill"
              field="monthlyBill"
              value={inputs.monthlyBill}
              min={50}
              max={600}
              step={1}
              prefix="$"
              description="Primary sizing input. The system target updates instantly from your monthly electricity spend."
              accentClassName="accent-violet-400"
              onChange={onInputChange}
            />

            <div className="rounded-[1.35rem] border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-white">Panels count</div>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                    Auto-calculated from your bill and then capped by real roof fit once a roof outline exists.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-light text-white">{financials.recommendedPanelCount}</div>
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Panels</div>
                </div>
              </div>
              <div className="mt-4 h-2 rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-400 via-sky-400 to-emerald-400"
                  style={{ width: `${panelCoveragePercent}%` }}
                />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Target</div>
                  <div className="mt-1 text-base text-white">{financials.targetPanelCount} panels</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Roof fit</div>
                  <div className="mt-1 text-base text-white">{roofFitLabel}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Placed now</div>
                  <div className="mt-1 text-base text-white">{placedPanelCount} panels</div>
                </div>
              </div>
            </div>

            <InputField
              label="Energy cost per kWh"
              field="energyCostPerKwh"
              value={inputs.energyCostPerKwh}
              min={0.08}
              max={0.45}
              step={0.01}
              prefix="$"
              suffix="/kWh"
              description="Used to convert your bill into estimated monthly usage and to project rising utility costs."
              accentClassName="accent-sky-400"
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
              description="Defaulted to $0 nationally. Enter state, utility, or installer rebates here if they apply to your project."
              accentClassName="accent-emerald-400"
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
              suffix="/W"
              description="Gross install benchmark before incentives. Edit this to match your installer quote."
              accentClassName="accent-amber-400"
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
              description="Electrical output per module. Footprint still follows the panel type selected in the sidebar."
              accentClassName="accent-rose-400"
              onChange={onInputChange}
            />
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard
                icon={<SunMedium size={20} className="text-violet-100" />}
                label="Yearly energy"
                value={`${formatNumber(financials.yearlyEnergyKwh, 1)} kWh`}
                detail={`Offsets about ${formatNumber(financials.monthlyUsageKwh, 0)} kWh/month from your bill model.`}
                tone="border-violet-300/20 bg-violet-500/10"
              />
              <SummaryCard
                icon={<Home size={20} className="text-sky-100" />}
                label="Installation size"
                value={`${formatNumber(financials.installationSizeKw, 1)} kW`}
                detail={`${financials.recommendedPanelCount} x ${formatWholeNumber(inputs.panelCapacityWatts)}W modules`}
                tone="border-sky-300/20 bg-sky-500/10"
              />
              <SummaryCard
                icon={<DollarSign size={20} className="text-amber-100" />}
                label="Installation cost"
                value={formatCurrency(financials.netInstallationCost)}
                detail={
                  financials.solarIncentiveAmountApplied > 0
                    ? `${formatCurrency(financials.grossInstallationCost)} gross less ${formatCurrency(financials.solarIncentiveAmountApplied)} incentives`
                    : `${formatCurrency(financials.grossInstallationCost)} gross install cost`
                }
                tone="border-amber-300/20 bg-amber-500/10"
              />
              <SummaryCard
                icon={<Gauge size={20} className="text-emerald-100" />}
                label="Energy covered"
                value={`${formatNumber(financials.energyCoveredPercent, 0)} %`}
                detail={
                  financials.roofLimited
                    ? `${formatNumber(financials.monthlyShortfallKwh, 0)} kWh/month still comes from the grid`
                    : "System target fully covered by the current roof-fit plan"
                }
                tone="border-emerald-300/20 bg-emerald-500/10"
              />
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                  <Zap size={12} />
                  Estimated usage
                </div>
                <div className="mt-3 text-xl font-light text-white">{formatNumber(financials.monthlyUsageKwh, 0)} kWh/mo</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Annual shortfall</div>
                <div className="mt-3 text-xl font-light text-white">{formatNumber(financials.annualShortfallKwh, 0)} kWh</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Net install</div>
                <div className="mt-3 text-xl font-light text-white">{formatCurrency(financials.netInstallationCost)}</div>
              </div>
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Placed vs plan</div>
                <div className="mt-3 text-xl font-light text-white">
                  {placedPanelCount}/{financials.recommendedPanelCount}
                </div>
              </div>
            </div>

            <section className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-lg font-medium text-white">Cost analysis for 20 years</div>
                  <p className="mt-1 text-sm text-zinc-400">
                    Assumes 3% annual utility inflation and 0.5% annual panel degradation.
                  </p>
                </div>
                <div className="text-xs uppercase tracking-[0.16em] text-zinc-500">
                  Solar vs no-solar cumulative cost
                </div>
              </div>

              <div ref={chartRef} className="mt-4 min-h-[18rem]">
                <ChartRegionErrorBoundary fallback={chartFallback}>
                  {canRenderChart ? (
                    <Suspense fallback={<ChartFallbackSummary financials={financials} isLoading />}>
                      <SolarFinancialChart
                        data={financials.financialProjection}
                        breakEvenCalendarYear={financials.breakEvenCalendarYear}
                        width={chartSize.width}
                        height={Math.max(280, chartSize.height)}
                      />
                    </Suspense>
                  ) : (
                    chartFallback
                  )}
                </ChartRegionErrorBoundary>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <StatRow label="Cost without solar" value={formatCurrency(financials.costWithoutSolarTwentyYear)} />
                <StatRow label="Cost with solar" value={formatCurrency(financials.costWithSolarTwentyYear)} />
                <StatRow label="Savings" value={formatCurrency(financials.totalTwentyYearSavings)} tone="text-emerald-300" />
                <StatRow label="Break even" value={breakEvenLabel} />
              </div>
            </section>

            <SyncStrip syncState={syncState} syncMessage={syncMessage} />
          </div>
        </div>
      </div>
    </Card>
  );
}
