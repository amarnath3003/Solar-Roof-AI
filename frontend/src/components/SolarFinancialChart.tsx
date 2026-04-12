import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SolarProjectionPoint } from "@/hooks/useSolarFinancials";

type SolarFinancialChartProps = {
  data: SolarProjectionPoint[];
  breakEvenCalendarYear: number | null;
  width: number;
  height: number;
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

function formatCompactCurrency(value: number) {
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absoluteValue >= 1_000_000) {
    return `${sign}$${formatNumber(absoluteValue / 1_000_000)}M`;
  }

  if (absoluteValue >= 1_000) {
    return `${sign}$${formatNumber(absoluteValue / 1_000)}K`;
  }

  return `${sign}$${formatNumber(absoluteValue, 0)}`;
}

export default function SolarFinancialChart({
  data,
  breakEvenCalendarYear,
  width,
  height,
}: SolarFinancialChartProps) {
  return (
    <LineChart data={data} width={width} height={height} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
      <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="4 4" />
      <XAxis
        dataKey="calendarYear"
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
        labelFormatter={(label: number) => `${label}`}
      />
      <Legend wrapperStyle={{ fontSize: "12px", color: "rgba(255,255,255,0.72)" }} />
      {breakEvenCalendarYear ? (
        <ReferenceLine
          x={breakEvenCalendarYear}
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
        dataKey="costWithSolar"
        name="Solar"
        stroke="#60a5fa"
        strokeWidth={3}
        dot={false}
        activeDot={{ r: 5 }}
      />
      <Line
        type="monotone"
        dataKey="costWithoutSolar"
        name="No solar"
        stroke="#f87171"
        strokeWidth={3}
        dot={false}
        activeDot={{ r: 5 }}
      />
    </LineChart>
  );
}
