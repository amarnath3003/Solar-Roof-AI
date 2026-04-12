import { useMemo } from "react";

const US_SOLAR_YIELD_KWH_PER_KW = 1450;
const UTILITY_INFLATION_RATE = 1.03;
const PANEL_DEGRADATION_RATE = 0.995;
const PROJECTION_YEARS = 20;
const DEFAULT_PERFORMANCE_RATIO = 0.82;
const MIN_PERFORMANCE_RATIO = 0.6;
const MAX_PERFORMANCE_RATIO = 0.95;
const MAX_SHADE_LOSS = 0.35;

function roundValue(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

function roundMoney(value: number) {
  return roundValue(value, 2);
}

export type SolarFinancialInputs = {
  monthlyBill: number;
  panelCapacityWatts: number;
  energyCostPerKwh: number;
  solarIncentiveAmount: number;
  costPerWatt: number;
  roofMaxPanelCount?: number | null;
  roofNetSqFt?: number | null;
  roofBlockedSqFt?: number | null;
  selectedPanelCount?: number | null;
  panelFootprintSqFt?: number | null;
  performanceRatio?: number;
};

export type SolarProjectionPoint = {
  year: number;
  calendarYear: number;
  costWithoutSolar: number;
  costWithSolar: number;
  energyCostPerKwh: number;
  yearlyProductionKwh: number;
  gridDependencyKwh: number;
};

export type SolarFinancialResults = {
  monthlyBill: number;
  estimatedMonthlyBill: number;
  monthlyUsageKwh: number;
  annualConsumptionKwh: number;
  targetSystemSizeKw: number;
  targetPanelCount: number;
  roofMaxPanelCount: number | null;
  recommendedPanelCount: number;
  roofLimited: boolean;
  installationSizeKw: number;
  yearlyEnergyKwh: number;
  grossInstallationCost: number;
  solarIncentiveAmountApplied: number;
  netInstallationCost: number;
  energyCoveredPercent: number;
  energyCoveredDisplayPercent: number;
  annualShortfallKwh: number;
  monthlyShortfallKwh: number;
  costWithoutSolarTwentyYear: number;
  costWithSolarTwentyYear: number;
  totalTwentyYearSavings: number;
  breakEvenYear: number | null;
  breakEvenCalendarYear: number | null;
  selectedPanelCount: number | null;
  activePanelCount: number;
  effectiveYieldKwhPerKw: number;
  performanceRatioApplied: number;
  shadeLossPercent: number;
  roofNetSqFt: number | null;
  roofBlockedSqFt: number | null;
  panelFootprintSqFt: number | null;
  financialProjection: SolarProjectionPoint[];
};

export function useSolarFinancials(inputs: SolarFinancialInputs): SolarFinancialResults {
  return useMemo(() => {
    const monthlyBill = Math.max(0, inputs.monthlyBill);
    const panelCapacityWatts = Math.max(1, inputs.panelCapacityWatts);
    const energyCostPerKwh = Math.max(0.01, inputs.energyCostPerKwh);
    const solarIncentiveAmount = Math.max(0, inputs.solarIncentiveAmount);
    const costPerWatt = Math.max(0, inputs.costPerWatt);
    const roofNetSqFt =
      typeof inputs.roofNetSqFt === "number" && Number.isFinite(inputs.roofNetSqFt)
        ? Math.max(0, inputs.roofNetSqFt)
        : null;
    const roofBlockedSqFt =
      typeof inputs.roofBlockedSqFt === "number" && Number.isFinite(inputs.roofBlockedSqFt)
        ? Math.max(0, inputs.roofBlockedSqFt)
        : null;
    const panelFootprintSqFt =
      typeof inputs.panelFootprintSqFt === "number" && Number.isFinite(inputs.panelFootprintSqFt)
        ? Math.max(0, inputs.panelFootprintSqFt)
        : null;
    const selectedPanelCount =
      typeof inputs.selectedPanelCount === "number" && Number.isFinite(inputs.selectedPanelCount)
        ? Math.max(0, Math.floor(inputs.selectedPanelCount))
        : null;
    const performanceRatioApplied =
      typeof inputs.performanceRatio === "number" && Number.isFinite(inputs.performanceRatio)
        ? Math.max(MIN_PERFORMANCE_RATIO, Math.min(MAX_PERFORMANCE_RATIO, inputs.performanceRatio))
        : DEFAULT_PERFORMANCE_RATIO;

    const grossRoofSqFt = roofNetSqFt !== null && roofBlockedSqFt !== null ? roofNetSqFt + roofBlockedSqFt : null;
    const blockedRatio = grossRoofSqFt && grossRoofSqFt > 0 && roofBlockedSqFt !== null ? roofBlockedSqFt / grossRoofSqFt : 0;
    const shadeLossRatio = Math.min(MAX_SHADE_LOSS, Math.max(0, blockedRatio * 0.6));
    const effectiveYieldKwhPerKw = US_SOLAR_YIELD_KWH_PER_KW * performanceRatioApplied * (1 - shadeLossRatio);

    const monthlyUsageKwh = monthlyBill / energyCostPerKwh;
    const annualConsumptionKwh = monthlyUsageKwh * 12;
    const targetSystemSizeKw = annualConsumptionKwh / effectiveYieldKwhPerKw;
    const targetPanelCount = Math.max(0, Math.ceil((targetSystemSizeKw * 1000) / panelCapacityWatts));
    const roofMaxPanelCount =
      typeof inputs.roofMaxPanelCount === "number" && Number.isFinite(inputs.roofMaxPanelCount)
        ? Math.max(0, Math.floor(inputs.roofMaxPanelCount))
        : null;
    const recommendedPanelCount = roofMaxPanelCount === null ? targetPanelCount : Math.min(targetPanelCount, roofMaxPanelCount);
    const activePanelCount =
      selectedPanelCount === null
        ? recommendedPanelCount
        : roofMaxPanelCount === null
          ? selectedPanelCount
          : Math.min(selectedPanelCount, roofMaxPanelCount);
    const roofLimited = roofMaxPanelCount !== null && roofMaxPanelCount < targetPanelCount;
    const installationSizeKw = (activePanelCount * panelCapacityWatts) / 1000;
    const yearlyEnergyKwh = installationSizeKw * effectiveYieldKwhPerKw;
    const grossInstallationCost = installationSizeKw * 1000 * costPerWatt;
    const solarIncentiveAmountApplied = Math.min(solarIncentiveAmount, grossInstallationCost);
    const netInstallationCost = Math.max(0, grossInstallationCost - solarIncentiveAmountApplied);
    const energyCoveredPercent = annualConsumptionKwh > 0 ? (yearlyEnergyKwh / annualConsumptionKwh) * 100 : 0;
    const energyCoveredDisplayPercent = Math.min(100, energyCoveredPercent);
    const annualShortfallKwh = Math.max(0, annualConsumptionKwh - yearlyEnergyKwh);
    const monthlyShortfallKwh = annualShortfallKwh / 12;
    const startYear = new Date().getFullYear();

    let currentEnergyCostPerKwh = energyCostPerKwh;
    let currentYearlyProductionKwh = yearlyEnergyKwh;
    let cumulativeWithoutSolar = 0;
    let cumulativeWithSolar = netInstallationCost;
    let breakEvenYear: number | null = null;

    const financialProjection: SolarProjectionPoint[] = [];

    for (let year = 1; year <= PROJECTION_YEARS; year += 1) {
      cumulativeWithoutSolar += annualConsumptionKwh * currentEnergyCostPerKwh;
      cumulativeWithSolar += Math.max(0, annualConsumptionKwh - currentYearlyProductionKwh) * currentEnergyCostPerKwh;

      const roundedWithoutSolar = roundMoney(cumulativeWithoutSolar);
      const roundedWithSolar = roundMoney(cumulativeWithSolar);

      if (breakEvenYear === null && roundedWithoutSolar > roundedWithSolar) {
        breakEvenYear = year;
      }

      financialProjection.push({
        year,
        calendarYear: startYear + year - 1,
        costWithoutSolar: roundedWithoutSolar,
        costWithSolar: roundedWithSolar,
        energyCostPerKwh: roundValue(currentEnergyCostPerKwh, 4),
        yearlyProductionKwh: roundValue(currentYearlyProductionKwh, 2),
        gridDependencyKwh: roundValue(Math.max(0, annualConsumptionKwh - currentYearlyProductionKwh), 2),
      });

      currentEnergyCostPerKwh *= UTILITY_INFLATION_RATE;
      currentYearlyProductionKwh *= PANEL_DEGRADATION_RATE;
    }

    const finalProjectionPoint = financialProjection[financialProjection.length - 1];
    const costWithoutSolarTwentyYear = finalProjectionPoint?.costWithoutSolar ?? 0;
    const costWithSolarTwentyYear = finalProjectionPoint?.costWithSolar ?? netInstallationCost;
    const totalTwentyYearSavings = costWithoutSolarTwentyYear - costWithSolarTwentyYear;

    return {
      monthlyBill: roundMoney(monthlyBill),
      estimatedMonthlyBill: roundMoney(monthlyUsageKwh * energyCostPerKwh),
      monthlyUsageKwh: roundValue(monthlyUsageKwh, 2),
      annualConsumptionKwh: roundValue(annualConsumptionKwh, 2),
      targetSystemSizeKw: roundValue(targetSystemSizeKw, 2),
      targetPanelCount,
      roofMaxPanelCount,
      recommendedPanelCount,
      roofLimited,
      installationSizeKw: roundValue(installationSizeKw, 2),
      yearlyEnergyKwh: roundValue(yearlyEnergyKwh, 2),
      grossInstallationCost: roundMoney(grossInstallationCost),
      solarIncentiveAmountApplied: roundMoney(solarIncentiveAmountApplied),
      netInstallationCost: roundMoney(netInstallationCost),
      energyCoveredPercent: roundValue(energyCoveredPercent, 2),
      energyCoveredDisplayPercent: roundValue(energyCoveredDisplayPercent, 2),
      annualShortfallKwh: roundValue(annualShortfallKwh, 2),
      monthlyShortfallKwh: roundValue(monthlyShortfallKwh, 2),
      costWithoutSolarTwentyYear: roundMoney(costWithoutSolarTwentyYear),
      costWithSolarTwentyYear: roundMoney(costWithSolarTwentyYear),
      totalTwentyYearSavings: roundMoney(totalTwentyYearSavings),
      breakEvenYear,
      breakEvenCalendarYear: breakEvenYear === null ? null : startYear + breakEvenYear - 1,
      selectedPanelCount,
      activePanelCount,
      effectiveYieldKwhPerKw: roundValue(effectiveYieldKwhPerKw, 2),
      performanceRatioApplied: roundValue(performanceRatioApplied, 3),
      shadeLossPercent: roundValue(shadeLossRatio * 100, 2),
      roofNetSqFt: roofNetSqFt === null ? null : roundValue(roofNetSqFt, 2),
      roofBlockedSqFt: roofBlockedSqFt === null ? null : roundValue(roofBlockedSqFt, 2),
      panelFootprintSqFt: panelFootprintSqFt === null ? null : roundValue(panelFootprintSqFt, 2),
      financialProjection,
    };
  }, [inputs]);
}
