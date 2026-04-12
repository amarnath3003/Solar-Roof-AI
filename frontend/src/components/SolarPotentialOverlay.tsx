import React, { useState } from "react";
import { BarChart3, DollarSign, Gauge, Home, SunMedium, X } from "lucide-react";
import { Card } from "@/components/ui/glass";
import { SolarFinancialResults } from "@/hooks/useSolarFinancials";
import SolarFinancialChart from "@/components/SolarFinancialChart";

class OverlayChartErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
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
      console.error("Solar potential overlay chart failed to render.", error, errorInfo);
    }
  }

  componentDidUpdate(prevProps: Readonly<{ children: React.ReactNode; fallback: React.ReactNode }>) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function formatCurrency(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1) {
  if (value == null || !Number.isFinite(value)) return "0";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function StatRow({
  label,
  value,
  tone = "text-white",
}: {
  label: React.ReactNode;
  value: string;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[0.9rem] border border-white/8 bg-black/20 px-3 py-2">
      <div className="text-[11px] text-zinc-300">{label}</div>
      <div className={`text-right text-xs font-medium ${tone}`}>{value}</div>
    </div>
  );
}

export function SolarPotentialOverlay({ financials }: { financials: SolarFinancialResults }) {
  const [isVisible, setIsVisible] = useState(false);

  if (!financials || financials.targetSystemSizeKw === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsVisible((previous) => !previous)}
        className="absolute left-4 top-[7rem] z-[401] flex h-9 items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-black/60 px-3 text-xs font-medium text-cyan-100 backdrop-blur-md transition-colors hover:bg-black/80 shadow-xl"
      >
        {isVisible ? <X size={14} className="text-zinc-300" /> : <BarChart3 size={14} className="text-cyan-200" />}
        <span>{isVisible ? "Hide Analysis" : "Show Analysis"}</span>
      </button>

      {isVisible ? (
        <div className="pointer-events-none absolute left-4 top-[9.6rem] z-[400] flex max-h-[calc(100%-10.5rem)] w-[16.5rem] flex-col gap-2.5 overflow-y-auto custom-scrollbar">
          <Card className="pointer-events-auto rounded-[1.2rem] border-cyan-300/15 bg-black/70 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center gap-2">
              <DollarSign size={14} className="text-cyan-200" />
              <h2 className="text-xs font-medium uppercase tracking-[0.12em] text-cyan-100">Solar Potential</h2>
            </div>
            <div className="mb-2 mt-2 border-t border-white/10" />

            <div className="flex flex-col gap-2">
              <StatRow
                label={
                  <span className="flex items-center gap-1.5">
                    <SunMedium size={11} className="text-cyan-200" /> Yearly energy
                  </span>
                }
                value={`${formatNumber(financials.yearlyEnergyKwh, 0)} kWh`}
              />
              <StatRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Home size={11} className="text-cyan-200" /> System size
                  </span>
                }
                value={`${formatNumber(financials.installationSizeKw, 2)} kW`}
              />
              <StatRow
                label={
                  <span className="flex items-center gap-1.5">
                    <Gauge size={11} className="text-cyan-200" /> Covered
                  </span>
                }
                value={`${formatNumber(financials.energyCoveredDisplayPercent, 1)}%`}
              />
              <StatRow label="Panels used" value={`${formatNumber(financials.activePanelCount, 0)} panels`} />
            </div>
          </Card>

          <Card className="pointer-events-auto rounded-[1.2rem] border-cyan-300/15 bg-black/70 p-3 shadow-2xl backdrop-blur-xl">
            <h2 className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-400">20 Year Cost Projection</h2>

            <div className="h-[104px] w-full">
              <OverlayChartErrorBoundary
                fallback={
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    Chart unavailable.
                  </div>
                }
              >
                <SolarFinancialChart
                  data={financials.financialProjection}
                  breakEvenCalendarYear={financials.breakEvenCalendarYear}
                  width={232}
                  height={104}
                />
              </OverlayChartErrorBoundary>
            </div>

            <div className="mt-2.5 flex flex-col gap-2">
              <StatRow label="Without solar" value={formatCurrency(financials.costWithoutSolarTwentyYear)} />
              <StatRow label="With solar" value={formatCurrency(financials.costWithSolarTwentyYear)} />
              <StatRow label="Savings" value={formatCurrency(financials.totalTwentyYearSavings)} tone="text-cyan-200" />
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}
