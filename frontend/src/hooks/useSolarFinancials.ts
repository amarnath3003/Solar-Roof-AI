import { useMemo } from "react";

export type SolarFinancialInputs = {
  monthlyBill: number;
  panelCount: number;
  panelCapacityWatts: number;
  energyCostPerKwh: number;
  costPerWatt: number;
  federalTaxCreditPct: number;
};

export type SolarProjectionPoint = {
  year: number;
  costWithoutSolar: number;
  costWithSolar: number;
};

export type SolarFinancialResults = {
  systemSizeKw: number;
  grossInstallationCost: number;
  incentives: number;
  netInstallationCost: number;
  annualConsumptionKwh: number;
  estimatedYearlyProductionKwh: number;
  energyCoveredPercent: number;
  energyCoveredDisplayPercent: number;
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
    const systemSizeKwRaw = (inputs.panelCount * inputs.panelCapacityWatts) / 1000;
    const grossInstallationCostRaw = systemSizeKwRaw * 1000 * inputs.costPerWatt;
    const incentivesRaw = grossInstallationCostRaw * (inputs.federalTaxCreditPct / 100);
    const netInstallationCostRaw = grossInstallationCostRaw - incentivesRaw;
    const annualConsumptionKwhRaw = (inputs.monthlyBill * 12) / inputs.energyCostPerKwh;
    const estimatedYearlyProductionKwhRaw = systemSizeKwRaw * PRODUCTION_MULTIPLIER;
    const energyCoveredPercentRaw =
      annualConsumptionKwhRaw > 0 ? (estimatedYearlyProductionKwhRaw / annualConsumptionKwhRaw) * 100 : 0;

    let currentEnergyCost = inputs.energyCostPerKwh;
    let currentProduction = estimatedYearlyProductionKwhRaw;
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
      financialProjection.find((year) => year.costWithoutSolar > year.costWithSolar)?.year ?? null;

    const finalYear = financialProjection[financialProjection.length - 1];
    const totalTwentyYearSavings = roundTo(finalYear.costWithoutSolar - finalYear.costWithSolar);

    return {
      systemSizeKw: roundTo(systemSizeKwRaw),
      grossInstallationCost: roundTo(grossInstallationCostRaw),
      incentives: roundTo(incentivesRaw),
      netInstallationCost: roundTo(netInstallationCostRaw),
      annualConsumptionKwh: roundTo(annualConsumptionKwhRaw),
      estimatedYearlyProductionKwh: roundTo(estimatedYearlyProductionKwhRaw),
      energyCoveredPercent: roundTo(energyCoveredPercentRaw),
      energyCoveredDisplayPercent: roundTo(Math.min(100, Math.max(0, energyCoveredPercentRaw))),
      breakEvenYear,
      totalTwentyYearSavings,
      financialProjection,
    };
  }, [inputs]);
}
