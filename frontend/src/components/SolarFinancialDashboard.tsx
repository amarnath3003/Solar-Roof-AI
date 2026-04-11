import { ReactNode, useState } from "react";
import { DollarSign, Gauge, SunMedium, TrendingUp, Zap } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/glass";
import { SolarFinancialInputs, useSolarFinancials } from "@/hooks/useSolarFinancials";

const DEFAULT_SOLAR_INPUTS: SolarFinancialInputs = {
  monthlyBill: 150,
  panelCount: 18,
  panelCapacityWatts: 400,
  energyCostPerKwh: 0.18,
  costPerWatt: 3.2,
  federalTaxCreditPct: 30,
};

type SolarFinancialFieldKey = keyof SolarFinancialInputs;

type SliderFieldProps = {
  label: string;
  description: string;
  field: SolarFinancialFieldKey;
  value: number;
  min: number;
  max: number;
  step: number;
  prefix?: string;
  suffix?: string;
  accentClassName: string;
  onChange: (field: SolarFinancialFieldKey, value: number, min: number, max: number) => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits,
  }).format(value);
}

function FieldNumber({
  prefix,
  suffix,
  value,
}: {
  prefix?: string;
  suffix?: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-white">
      <span className="text-zinc-500">{prefix}</span>
      <span>{value}</span>
      <span className="text-zinc-500">{suffix}</span>
    </div>
  );
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
        <div className="w-28">
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
              className="w-16 bg-transparent text-right outline-none"
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

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
  progressPercent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: string;
  progressPercent?: number;
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
      {typeof progressPercent === "number" ? (
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 transition-[width] duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SolarFinancialDashboard() {
  const [inputs, setInputs] = useState<SolarFinancialInputs>(DEFAULT_SOLAR_INPUTS);
  const financials = useSolarFinancials(inputs);

  const handleInputChange = (field: SolarFinancialFieldKey, value: number, min: number, max: number) => {
    setInputs((current) => ({
      ...current,
      [field]: clamp(value, min, max),
    }));
  };

  return (
    <Card className="overflow-hidden rounded-[2rem] border-white/15 p-0">
      <div className="border-b border-white/10 bg-[linear-gradient(135deg,rgba(34,197,94,0.12),rgba(14,165,233,0.06),rgba(0,0,0,0.18))] px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-200/80">Solar Financial Model</div>
            <h2 className="mt-2 text-xl font-medium tracking-[0.08em] text-white sm:text-2xl">Solar Financial & ROI Dashboard</h2>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300">
              Frontend-only financial modeling with modern US defaults, twenty-year cumulative cost curves, and an
              instant break-even estimate inspired by the Google Solar API financial breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setInputs(DEFAULT_SOLAR_INPUTS)}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.16em] text-zinc-200 transition hover:bg-white/10"
          >
            Reset Defaults
          </button>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="border-b border-white/10 bg-white/[0.02] p-5 sm:p-6 xl:border-b-0 xl:border-r">
          <div className="flex flex-col gap-6">
            <section>
              <div className="text-[10px] uppercase tracking-[0.16em] text-cyan-200">System Specs</div>
              <div className="mt-3 space-y-3">
                <SliderField
                  label="Panel Count"
                  description="Average-sized residential array baseline for a 7.2 kW system."
                  field="panelCount"
                  value={inputs.panelCount}
                  min={6}
                  max={40}
                  step={1}
                  accentClassName="accent-cyan-400"
                  onChange={handleInputChange}
                />
                <SliderField
                  label="Panel Capacity"
                  description="Modern high-efficiency residential module rating."
                  field="panelCapacityWatts"
                  value={inputs.panelCapacityWatts}
                  min={300}
                  max={550}
                  step={5}
                  suffix=" W"
                  accentClassName="accent-sky-400"
                  onChange={handleInputChange}
                />
              </div>
            </section>

            <section>
              <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-200">Financial Assumptions</div>
              <div className="mt-3 space-y-3">
                <SliderField
                  label="Monthly Bill"
                  description="Average US electricity bill used to estimate annual consumption."
                  field="monthlyBill"
                  value={inputs.monthlyBill}
                  min={50}
                  max={400}
                  step={5}
                  prefix="$"
                  accentClassName="accent-emerald-400"
                  onChange={handleInputChange}
                />
                <SliderField
                  label="Energy Cost"
                  description="Utility rate per kilowatt-hour for the home."
                  field="energyCostPerKwh"
                  value={inputs.energyCostPerKwh}
                  min={0.08}
                  max={0.4}
                  step={0.01}
                  prefix="$"
                  suffix="/kWh"
                  accentClassName="accent-amber-400"
                  onChange={handleInputChange}
                />
                <SliderField
                  label="Install Cost"
                  description="Gross installation cost per watt before incentives."
                  field="costPerWatt"
                  value={inputs.costPerWatt}
                  min={1.5}
                  max={6}
                  step={0.05}
                  prefix="$"
                  suffix="/W"
                  accentClassName="accent-orange-400"
                  onChange={handleInputChange}
                />
                <SliderField
                  label="Federal ITC"
                  description="Applied directly against gross installation cost."
                  field="federalTaxCreditPct"
                  value={inputs.federalTaxCreditPct}
                  min={0}
                  max={40}
                  step={1}
                  suffix="%"
                  accentClassName="accent-lime-400"
                  onChange={handleInputChange}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-emerald-300/20 bg-emerald-500/10 p-4">
              <div className="text-[10px] uppercase tracking-[0.16em] text-emerald-100">Current assumptions snapshot</div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white">
                <FieldNumber value={inputs.panelCount} />
                <FieldNumber value={inputs.panelCapacityWatts} suffix=" W" />
                <FieldNumber value={inputs.monthlyBill} prefix="$" />
                <FieldNumber value={inputs.energyCostPerKwh} prefix="$" suffix="/kWh" />
                <FieldNumber value={inputs.costPerWatt} prefix="$" suffix="/W" />
                <FieldNumber value={inputs.federalTaxCreditPct} suffix="%" />
              </div>
            </section>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <SummaryCard
              icon={<SunMedium size={18} className="text-amber-100" />}
              label="Yearly Energy"
              value={`${formatNumber(financials.estimatedYearlyProductionKwh, 0)} kWh`}
              detail={`Against ${formatNumber(financials.annualConsumptionKwh, 0)} kWh of annual consumption.`}
              tone="border-amber-300/25 bg-amber-400/10 text-amber-100"
            />
            <SummaryCard
              icon={<Gauge size={18} className="text-cyan-100" />}
              label="System Size"
              value={`${formatNumber(financials.systemSizeKw)} kW`}
              detail={`${inputs.panelCount} panels at ${formatNumber(inputs.panelCapacityWatts, 0)} W each.`}
              tone="border-cyan-300/25 bg-cyan-400/10 text-cyan-100"
            />
            <SummaryCard
              icon={<DollarSign size={18} className="text-emerald-100" />}
              label="Net Cost"
              value={formatCurrency(financials.netInstallationCost)}
              detail={`${formatCurrency(financials.incentives)} in federal incentives off ${formatCurrency(
                financials.grossInstallationCost
              )}.`}
              tone="border-emerald-300/25 bg-emerald-400/10 text-emerald-100"
            />
            <SummaryCard
              icon={<Zap size={18} className="text-sky-100" />}
              label="Energy Covered"
              value={`${formatNumber(financials.energyCoveredPercent)}%`}
              detail="Progress bar caps at 100% for display while preserving the real offset ratio in the math."
              tone="border-sky-300/25 bg-sky-400/10 text-sky-100"
              progressPercent={financials.energyCoveredDisplayPercent}
            />
          </div>

          <div className="mt-5 rounded-[1.75rem] border border-white/10 bg-black/20 p-4 sm:p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">20-Year Projection</div>
                <div className="mt-1 text-lg text-white">Cumulative utility cost with and without solar</div>
              </div>
              {financials.breakEvenYear ? (
                <div className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-emerald-100">
                  Break-even year: {financials.breakEvenYear}
                </div>
              ) : (
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                  No break-even in 20 years
                </div>
              )}
            </div>

            <div className="mt-5 h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={financials.financialProjection}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    stroke="rgba(255,255,255,0.45)"
                    tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  />
                  <YAxis
                    tickFormatter={formatCompactCurrency}
                    tickLine={false}
                    axisLine={false}
                    width={82}
                    stroke="rgba(255,255,255,0.45)"
                    tick={{ fill: "rgba(255,255,255,0.65)", fontSize: 12 }}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 18,
                      border: "1px solid rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(3, 7, 18, 0.92)",
                      color: "#fff",
                    }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelFormatter={(label: number) => `Year ${label}`}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }} />
                  {financials.breakEvenYear ? (
                    <ReferenceLine
                      x={financials.breakEvenYear}
                      stroke="rgba(74, 222, 128, 0.9)"
                      strokeDasharray="5 5"
                      label={{
                        value: "Break-even",
                        position: "insideTopLeft",
                        fill: "rgba(187, 247, 208, 0.9)",
                        fontSize: 11,
                      }}
                    />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="costWithoutSolar"
                    name="Without Solar"
                    stroke="#f87171"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="costWithSolar"
                    name="With Solar"
                    stroke="#60a5fa"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-[1.75rem] border border-emerald-300/20 bg-[linear-gradient(145deg,rgba(34,197,94,0.18),rgba(6,95,70,0.08),rgba(0,0,0,0.18))] p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-emerald-100/85">Total 20-Year Savings</div>
              <div className="mt-3 text-3xl font-light text-emerald-100 sm:text-4xl">
                {formatCurrency(financials.totalTwentyYearSavings)}
              </div>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-emerald-50/75">
                Difference between cumulative utility spend with no solar and modeled net install plus residual grid
                purchases over twenty years.
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-sky-300/20 bg-sky-500/10 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-sky-300/20 bg-sky-400/10 p-3">
                  <TrendingUp size={18} className="text-sky-100" />
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-sky-100/80">Break-even Timeline</div>
                  <div className="mt-1 text-xl text-white">
                    {financials.breakEvenYear
                      ? `Breaks even in ${financials.breakEvenYear} years`
                      : "Break-even extends beyond year 20"}
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Year 20 without solar</div>
                  <div className="mt-2 text-white">
                    {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithoutSolar)}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">Year 20 with solar</div>
                  <div className="mt-2 text-white">
                    {formatCurrency(financials.financialProjection[financials.financialProjection.length - 1].costWithSolar)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
