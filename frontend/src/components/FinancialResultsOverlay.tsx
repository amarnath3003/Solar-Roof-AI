import React, { Suspense, lazy } from "react";
import { DollarSign, Gauge, Home, SunMedium } from "lucide-react";
import { SolarFinancialResults } from "@/hooks/useSolarFinancials";

const SolarFinancialChart = lazy(() => import("@/components/SolarFinancialChart"));

interface FinancialResultsOverlayProps {
  financials: SolarFinancialResults;
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

function Stat({ icon, label, value, tone = "text-white" }: { icon?: React.ReactNode; label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {icon && <div className="text-indigo-600/80 dark:text-indigo-400/80">{icon}</div>}
        <span className="text-zinc-700 dark:text-zinc-300 font-semibold">{label}</span>
      </div>
      <div className={tone}>{value}</div>
    </div>
  );
}

export function FinancialResultsOverlay({ financials }: FinancialResultsOverlayProps) {
  return (
    <div className="absolute left-4 top-4 bottom-4 w-80 z-[1000] flex flex-col gap-4 overflow-y-auto custom-scrollbar pointer-events-none">
      
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 pointer-events-auto p-4 flex flex-col gap-2">
        <div className="flex items-center gap-2 text-indigo-700 dark:text-indigo-400 font-bold mb-2 border-b border-zinc-100 dark:border-zinc-800 pb-3">
          <DollarSign size={20} />
          <span className="text-base tracking-wide">Solar Potential analysis</span>
        </div>
        
        <Stat 
          icon={<SunMedium size={18} />} 
          label="Yearly energy" 
          value={`${formatNumber(financials.yearlyEnergyKwh, 1)} kWh`} 
          tone="text-zinc-600 dark:text-zinc-400 text-sm"
        />
        <Stat 
          icon={<Home size={18} />} 
          label="Installation size" 
          value={`${formatNumber(financials.installationSizeKw, 1)} kW`} 
          tone="text-zinc-600 dark:text-zinc-400 text-sm"
        />
        <Stat 
          icon={<DollarSign size={18} />} 
          label="Installation cost" 
          value={formatCurrency(financials.netInstallationCost)} 
          tone="text-zinc-600 dark:text-zinc-400 text-sm"
        />
        <Stat 
          icon={<Gauge size={18} />} 
          label="Energy covered" 
          value={`${formatNumber(financials.energyCoveredPercent, 0)} %`} 
          tone="text-zinc-600 dark:text-zinc-400 text-sm"
        />
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-800 pointer-events-auto p-4 flex flex-col gap-2">
        <div className="text-zinc-600 dark:text-zinc-400 text-base mb-2">Cost analysis for 20 years</div>
        <div className="h-44 w-full mb-2">
          <Suspense fallback={<div className="h-full w-full flex items-center justify-center text-zinc-400 text-xs">Loading chart...</div>}>
            <SolarFinancialChart
              data={financials.financialProjection}
              breakEvenCalendarYear={financials.breakEvenCalendarYear}
              width={280}
              height={170}
            />
          </Suspense>
        </div>
        <Stat label="Cost without solar" value={formatCurrency(financials.costWithoutSolarTwentyYear)} tone="text-zinc-600 dark:text-zinc-400 text-sm" />
        <Stat label="Cost with solar" value={formatCurrency(financials.costWithSolarTwentyYear)} tone="text-zinc-600 dark:text-zinc-400 text-sm" />
        <Stat label="Savings" value={formatCurrency(financials.totalTwentyYearSavings)} tone="text-zinc-600 dark:text-zinc-400 text-sm" />
        <Stat 
          label="Break even" 
          value={financials.breakEvenCalendarYear ? `${financials.breakEvenCalendarYear} in ${financials.breakEvenYear} years` : "-- years"} 
          tone="text-zinc-600 dark:text-zinc-400 text-sm" 
        />
      </div>
      
    </div>
  );
}
