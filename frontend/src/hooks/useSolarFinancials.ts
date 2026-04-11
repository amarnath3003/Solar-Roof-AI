import { useMemo } from "react";

export type SolarFinancialInputs = {
  monthlyUsageKwh: number;
  panelCapacityWatts: number;
  energyCostPerKwh: number;
  costPerWatt: number;
  federalTaxCreditPct: number;
  roofMaxPanelCount?: number | null;
};

export type SolarProjectionPoint = {
  year: number;
  costWithoutSolar: number;
  costWithSolar: number;
};

export type SolarFinancialResults = {
  annualConsumptionKwh: number;
  estimatedMonthlyBill: number;
  targetSystemSizeKw: number;
  targetPanelCount: number;
  roofMaxPanelCount: number | null;
  recommendedPanelCount: number;
  recommendedSystemSizeKw: number;
  grossInstallationCost: number;
  incentives: number;
  netInstallationCost: number;
  recommendedYearlyProductionKwh: number;
  annualShortfallKwh: number;
  monthlyShortfallKwh: number;
  energyCoveredPercent: number;
  energyCoveredDisplayPercent: number;
  roofLimited: boolean;
  breakEvenYear: number | null;
  totalTwentyYearSavings: number;
  financialProjection: SolarProjectionPoint[];
};

const UTILITY_INFLATION_RATE = 1.03;
const PANEL_DEGRADATION_RATE = 0.995;
const PRODUCTION_MULTIPLIER = 1450;
const PROJECTION_YEARS = 20;

function roundTo(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

export function useSolarFinancials(inputs: SolarFinancialInputs): SolarFinancialResults {
  return useMemo(() => {
    const annualConsumptionKwhRaw = inputs.monthlyUsageKwh * 12;
    const estimatedMonthlyBillRaw = inputs.monthlyUsageKwh * inputs.energyCostPerKwh;
    const targetSystemSizeKwRaw = annualConsumptionKwhRaw / PRODUCTION_MULTIPLIER;
    const targetPanelCount = Math.max(0, Math.ceil((targetSystemSizeKwRaw * 1000) / inputs.panelCapacityWatts));
    const roofMaxPanelCount =
      typeof inputs.roofMaxPanelCount === "number" && Number.isFinite(inputs.roofMaxPanelCount)
        ? Math.max(0, Math.floor(inputs.roofMaxPanelCount))
        : null;
    const recommendedPanelCount =
      roofMaxPanelCount === null ? targetPanelCount : Math.min(targetPanelCount, roofMaxPanelCount);
    const recommendedSystemSizeKwRaw = (recommendedPanelCount * inputs.panelCapacityWatts) / 1000;
    const grossInstallationCostRaw = recommendedSystemSizeKwRaw * 1000 * inputs.costPerWatt;
    const incentivesRaw = grossInstallationCostRaw * (inputs.federalTaxCreditPct / 100);
    const netInstallationCostRaw = grossInstallationCostRaw - incentivesRaw;
    const recommendedYearlyProductionKwhRaw = recommendedSystemSizeKwRaw * PRODUCTION_MULTIPLIER;
    const annualShortfallKwhRaw = Math.max(0, annualConsumptionKwhRaw - recommendedYearlyProductionKwhRaw);
    const monthlyShortfallKwhRaw = annualShortfallKwhRaw / 12;
    const energyCoveredPercentRaw =
      annualConsumptionKwhRaw > 0 ? (recommendedYearlyProductionKwhRaw / annualConsumptionKwhRaw) * 100 : 0;
    const roofLimited = roofMaxPanelCount !== null && roofMaxPanelCount < targetPanelCount;

    let currentEnergyCost = inputs.energyCostPerKwh;
    let currentProduction = recommendedYearlyProductionKwhRaw;
    let costWithoutSolarRunning = 0;
    let costWithSolarRunning = netInstallationCostRaw;

    const financialProjection: SolarProjectionPoint[] = [];

    for (let year = 1; year <= PROJECTION_YEARS; year += 1) {
      costWithoutSolarRunning += annualConsumptionKwhRaw * currentEnergyCost;

      const yearlyGridDependency = Math.max(0, annualConsumptionKwhRaw - currentProduction);
      costWithSolarRunning += yearlyGridDependency * currentEnergyCost;

      financialProjection.push({
        year,
        costWithoutSolar: roundTo(costWithoutSolarRunning),
        costWithSolar: roundTo(costWithSolarRunning),
      });

      currentEnergyCost *= UTILITY_INFLATION_RATE;
      currentProduction *= PANEL_DEGRADATION_RATE;
    }

    const breakEvenYear =
      financialProjection.find((yearProjection) => yearProjection.costWithoutSolar > yearProjection.costWithSolar)?.year ??
      null;
    const finalYear = financialProjection[financialProjection.length - 1];
    const totalTwentyYearSavings = roundTo(finalYear.costWithoutSolar - finalYear.costWithSolar);

    return {
      annualConsumptionKwh: roundTo(annualConsumptionKwhRaw),
      estimatedMonthlyBill: roundTo(estimatedMonthlyBillRaw),
      targetSystemSizeKw: roundTo(targetSystemSizeKwRaw),
      targetPanelCount,
      roofMaxPanelCount,
      recommendedPanelCount,
      recommendedSystemSizeKw: roundTo(recommendedSystemSizeKwRaw),
      grossInstallationCost: roundTo(grossInstallationCostRaw),
      incentives: roundTo(incentivesRaw),
      netInstallationCost: roundTo(netInstallationCostRaw),
      recommendedYearlyProductionKwh: roundTo(recommendedYearlyProductionKwhRaw),
      annualShortfallKwh: roundTo(annualShortfallKwhRaw),
      monthlyShortfallKwh: roundTo(monthlyShortfallKwhRaw),
      energyCoveredPercent: roundTo(energyCoveredPercentRaw),
      energyCoveredDisplayPercent: roundTo(Math.min(100, Math.max(0, energyCoveredPercentRaw))),
      roofLimited,
      breakEvenYear,
      totalTwentyYearSavings,
      financialProjection,
    };
  }, [inputs]);
}
