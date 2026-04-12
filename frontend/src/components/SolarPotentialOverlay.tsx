import React from "react";
import { DollarSign, Gauge, Home, SunMedium } from "lucide-react";
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
  if (value == null || !isFinite(value)) return "$0.00";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number | null | undefined, maximumFractionDigits = 1) {
  if (value == null || !isFinite(value)) return "0";
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
    <div className="flex items-center justify-between gap-4 rounded-[1.2rem] border border-white/8 bg-black/20 px-4 py-3">
      <div className="text-sm text-zinc-300">{label}</div>
      <div className={`text-right text-base font-medium ${tone}`}>{value}</div>
    </div>
  );
}

export function SolarPotentialOverlay({ financials }: { financials: SolarFinancialResults }) {
  if (!financials || financials.targetSystemSizeKw === 0) return null;

  return (
    <div className="absolute top-4 left-4 z-[400] w-[22.5rem] max-h-[calc(100%-2rem)] flex flex-col gap-4 overflow-y-auto pointer-events-none custom-scrollbar">
      
      {/* Card 1: Solar Potential analysis */}
      <Card className="pointer-events-auto p-5 rounded-[1.6rem] border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="text-violet-300">
            <DollarSign size={20} />
          </div>
          <h2 className="text-lg font-medium tracking-[0.04em] text-violet-200">Solar Potential analysis</h2>
        </div>
        <div className="mt-4 border-t border-white/10 mb-4" />
        
        <div className="flex flex-col gap-3">
          <StatRow 
            label={
              <span className="flex items-center gap-2">
                <SunMedium size={14} className="text-violet-300" /> Yearly energy
              </span>
            }
            value={`${formatNumber(financials.yearlyEnergyKwh)} kWh`} 
          />
          <StatRow 
            label={
              <span className="flex items-center gap-2">
                <Home size={14} className="text-sky-300" /> Installation size
              </span>
            }
            value={`${formatNumber(financials.installationSizeKw)} kW`} 
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
            value={`${formatNumber(financials.energyCoveredDisplayPercent)}%`} 
          />
          <StatRow
            label="Panels used"
            value={`${formatNumber(financials.activePanelCount, 0)} panels`}
          />
          <StatRow
            label="Effective yield"
            value={`${formatNumber(financials.effectiveYieldKwhPerKw, 0)} kWh/kW`}
          />
        </div>
      </Card>

      {/* Card 2: Cost analysis for 20 years */}
      <Card className="pointer-events-auto p-5 rounded-[1.6rem] border-white/10 bg-white/5 backdrop-blur-md shadow-2xl">
        <h2 className="text-sm font-medium tracking-[0.06em] text-zinc-400 uppercase mb-4">Cost analysis for 20 years</h2>
        
        <div className="h-[180px] w-full">
          <OverlayChartErrorBoundary
            fallback={
              <div className="flex h-full items-center justify-center text-zinc-500 text-sm">
                Chart temporarily unavailable.
              </div>
            }
          >
            <SolarFinancialChart 
              data={financials.financialProjection}
              breakEvenCalendarYear={financials.breakEvenCalendarYear}
              width={320} 
              height={180}
            />
          </OverlayChartErrorBoundary>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <StatRow 
            label="Cost without solar" 
            value={formatCurrency(financials.costWithoutSolarTwentyYear)} 
          />
          <StatRow 
            label="Cost with solar" 
            value={formatCurrency(financials.costWithSolarTwentyYear)} 
          />
          <StatRow 
            label="Savings" 
            value={formatCurrency(financials.totalTwentyYearSavings)} 
            tone="text-emerald-400" 
          />
          <StatRow 
            label="Break even" 
            value={financials.breakEvenCalendarYear !== null ? `${financials.breakEvenCalendarYear} in ${financials.breakEvenYear} years` : "-- years"} 
            tone="text-emerald-400" 
          />
        </div>
      </Card>

    </div>
  );
}
