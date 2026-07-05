import { describe, expect, it } from "vitest";
import { calculateSolarFinancials, SolarFinancialInputs } from "./useSolarFinancials";

const BASE_INPUTS: SolarFinancialInputs = {
  monthlyBill: 142.26,
  panelCapacityWatts: 400,
  energyCostPerKwh: 0.18,
  solarIncentiveAmount: 0,
  costPerWatt: 2.9,
};

describe("calculateSolarFinancials", () => {
  it("produces a consistent baseline model for default inputs", () => {
    const result = calculateSolarFinancials(BASE_INPUTS);

    expect(result.monthlyUsageKwh).toBeCloseTo(142.26 / 0.18, 1);
    expect(result.annualConsumptionKwh).toBeCloseTo((142.26 / 0.18) * 12, 0);
    expect(result.targetPanelCount).toBeGreaterThan(0);
    expect(result.financialProjection).toHaveLength(20);
    expect(result.performanceRatioApplied).toBe(0.82);
  });

  it("returns zero panels for a zero bill", () => {
    const result = calculateSolarFinancials({ ...BASE_INPUTS, monthlyBill: 0 });

    expect(result.targetPanelCount).toBe(0);
    expect(result.installationSizeKw).toBe(0);
    expect(result.netInstallationCost).toBe(0);
    expect(result.energyCoveredPercent).toBe(0);
  });

  it("caps the recommended panel count at the roof maximum", () => {
    const unconstrained = calculateSolarFinancials(BASE_INPUTS);
    const roofMax = Math.max(1, unconstrained.targetPanelCount - 2);
    const result = calculateSolarFinancials({ ...BASE_INPUTS, roofMaxPanelCount: roofMax });

    expect(result.recommendedPanelCount).toBe(roofMax);
    expect(result.roofLimited).toBe(true);
    expect(result.annualShortfallKwh).toBeGreaterThan(0);
  });

  it("caps the selected panel count at the roof maximum", () => {
    const result = calculateSolarFinancials({
      ...BASE_INPUTS,
      roofMaxPanelCount: 10,
      selectedPanelCount: 25,
    });

    expect(result.activePanelCount).toBe(10);
  });

  it("never applies more incentive than the gross installation cost", () => {
    const result = calculateSolarFinancials({
      ...BASE_INPUTS,
      selectedPanelCount: 1,
      solarIncentiveAmount: 1_000_000,
    });

    expect(result.solarIncentiveAmountApplied).toBe(result.grossInstallationCost);
    expect(result.netInstallationCost).toBe(0);
  });

  it("clamps the performance ratio into its documented range", () => {
    const low = calculateSolarFinancials({ ...BASE_INPUTS, performanceRatio: 0.1 });
    const high = calculateSolarFinancials({ ...BASE_INPUTS, performanceRatio: 1.5 });

    expect(low.performanceRatioApplied).toBe(0.6);
    expect(high.performanceRatioApplied).toBe(0.95);
  });

  it("derives shade loss from the blocked roof ratio and caps it", () => {
    const noShade = calculateSolarFinancials({ ...BASE_INPUTS, roofNetSqFt: 1000, roofBlockedSqFt: 0 });
    const heavyShade = calculateSolarFinancials({ ...BASE_INPUTS, roofNetSqFt: 100, roofBlockedSqFt: 900 });

    expect(noShade.shadeLossPercent).toBe(0);
    expect(heavyShade.shadeLossPercent).toBe(35);
    expect(heavyShade.effectiveYieldKwhPerKw).toBeLessThan(noShade.effectiveYieldKwhPerKw);
  });

  it("produces a monotonically increasing 20-year cost projection", () => {
    const result = calculateSolarFinancials(BASE_INPUTS);

    for (let index = 1; index < result.financialProjection.length; index += 1) {
      expect(result.financialProjection[index].costWithoutSolar).toBeGreaterThan(
        result.financialProjection[index - 1].costWithoutSolar
      );
      expect(result.financialProjection[index].costWithSolar).toBeGreaterThanOrEqual(
        result.financialProjection[index - 1].costWithSolar
      );
    }
  });

  it("finds a break-even year when solar covers usage at reasonable cost", () => {
    const result = calculateSolarFinancials(BASE_INPUTS);

    expect(result.breakEvenYear).not.toBeNull();
    expect(result.breakEvenYear).toBeGreaterThan(0);
    expect(result.breakEvenYear).toBeLessThanOrEqual(20);
    expect(result.totalTwentyYearSavings).toBeGreaterThan(0);
  });
});
