// ============================================================
// DCF Valuation & Sensitivity Analysis Engine
// Core mathematical framework for M&A corporate finance modeling
// ============================================================

export const FORECAST_YEARS = 5;

// Blank starting state — all inputs empty
export const BLANK_INPUTS = {
  historicalRevenue: null,
  grossMargin: null,
  opex: null,
  da: null,
  capex: null,
  deltaNWC: null,
  taxRate: null,
  revenueGrowth: [null, null, null, null, null],
  marginExpansion: [null, null, null, null, null],
  wacc: null,
  perpetuityGrowth: null,
  exitMultiple: null,
  currentSharePrice: null,
  fullyDilutedShares: null,
  totalDebt: null,
  cash: null,
  nonControllingInterests: null,
  discountingConvention: 'midyear',
  terminalMethod: 'perpetuity',
  costSynergies: 0,
  revenueSynergies: 0,
  synergyRealization: 0.5,
};

// Pre-loaded sample: Happy Hour Co — extracted from the provided Excel model
export const SAMPLE_INPUTS = {
  historicalRevenue: 1138.6,
  grossMargin: 0.5073,
  opex: 350,
  da: 45,
  capex: 70,
  deltaNWC: 15,
  taxRate: 0.19,
  revenueGrowth: [0.0093, -0.0428, 0.2308, 0.0688, -0.0030],
  marginExpansion: [0, -0.0073, 0.0017, 0.0019, 0.0148],
  wacc: 0.09,
  perpetuityGrowth: 0.005,
  exitMultiple: 9.0,
  currentSharePrice: 8.50,
  fullyDilutedShares: 120,
  totalDebt: 180,
  cash: 80,
  nonControllingInterests: 0,
  discountingConvention: 'midyear',
  terminalMethod: 'perpetuity',
  costSynergies: 0,
  revenueSynergies: 0,
  synergyRealization: 0.5,
};

// Kept for backward compatibility
export const DEFAULT_INPUTS = SAMPLE_INPUTS;

export const SCENARIO_PRESETS = {
  base: {
    label: 'Base Case',
    description: 'Default baseline assumptions',
    revenueGrowthDelta: [0, 0, 0, 0, 0],
    marginExpansionDelta: [0, 0, 0, 0, 0],
  },
  management: {
    label: 'Management Case',
    description: 'Optimistic growth and margin expansion',
    revenueGrowthDelta: [0.025, 0.025, 0.02, 0.015, 0.015],
    marginExpansionDelta: [0.015, 0.015, 0.01, 0.008, 0.005],
  },
  downside: {
    label: 'Downside / Shock',
    description: 'Revenue drop and margin compression',
    revenueGrowthDelta: [-0.07, -0.045, -0.025, -0.01, 0.0],
    marginExpansionDelta: [-0.03, -0.025, -0.015, -0.01, -0.005],
  },
};

// Check if all required inputs are provided
export function isInputsComplete(inputs) {
  const required = ['historicalRevenue', 'grossMargin', 'taxRate', 'wacc', 'fullyDilutedShares'];
  if (inputs.terminalMethod === 'perpetuity') required.push('perpetuityGrowth');
  else required.push('exitMultiple');
  return required.every(f => inputs[f] != null && inputs[f] !== '' && !isNaN(inputs[f]) && isFinite(inputs[f]));
}

// Apply scenario modifiers to base inputs
export function applyScenario(inputs, scenarioKey) {
  const preset = SCENARIO_PRESETS[scenarioKey] || SCENARIO_PRESETS.base;
  return {
    ...inputs,
    revenueGrowth: inputs.revenueGrowth.map((g, i) => (g == null ? null : g + (preset.revenueGrowthDelta[i] || 0))),
    marginExpansion: inputs.marginExpansion.map((m, i) => (m == null ? null : m + (preset.marginExpansionDelta[i] || 0))),
  };
}

// Synergy phase-in: Year 1 = 50% of realization, Year 2+ = 100%
function getSynergyPhase(yearIdx, realization) {
  if (yearIdx === 0) return 0.5 * (realization || 0);
  return realization || 0;
}

// ============================================================
// 1. Unlevered Free Cash Flow (UFCF) Architecture
// ============================================================
export function computeForecast(inputs) {
  if (inputs.historicalRevenue == null || inputs.grossMargin == null) return null;
  if (!isFinite(inputs.historicalRevenue) || inputs.historicalRevenue <= 0) return null;
  if (!isFinite(inputs.grossMargin)) return null;

  const years = [];
  const opexPct = (inputs.opex || 0) / inputs.historicalRevenue;
  const daPct = (inputs.da || 0) / inputs.historicalRevenue;
  const capexPct = (inputs.capex || 0) / inputs.historicalRevenue;
  const nwcPct = (inputs.deltaNWC || 0) / inputs.historicalRevenue;

  let prevRevenue = inputs.historicalRevenue;

  for (let i = 0; i < FORECAST_YEARS; i++) {
    const growth = inputs.revenueGrowth[i] || 0;
    const marginExp = inputs.marginExpansion[i] || 0;

    const synergyPhase = getSynergyPhase(i, inputs.synergyRealization);
    const revSynergy = (inputs.revenueSynergies || 0) * synergyPhase;
    const costSynergy = (inputs.costSynergies || 0) * synergyPhase;

    const revenue = prevRevenue * (1 + growth) + revSynergy;
    const grossMargin = inputs.grossMargin + marginExp;
    const grossProfit = revenue * grossMargin;
    const opex = revenue * opexPct - costSynergy;
    const ebit = grossProfit - opex;
    const da = revenue * daPct;
    const ebitda = ebit + da;
    const capex = revenue * capexPct;
    const deltaNWC = revenue * nwcPct;
    const nopat = ebit * (1 - (inputs.taxRate || 0));
    const ufcf = nopat + da - capex - deltaNWC;

    years.push({
      year: i + 1, revenue, grossMargin, grossProfit, opex, ebit, ebitda,
      da, capex, deltaNWC, nopat, ufcf, growth,
    });

    prevRevenue = revenue;
  }

  return years;
}

// ============================================================
// 2 & 3. Present Value + Terminal Value + Enterprise Value
// ============================================================
export function computeValuation(inputs, forecast) {
  if (!forecast || inputs.wacc == null || inputs.taxRate == null) return null;
  if (!isFinite(inputs.wacc) || !isFinite(inputs.taxRate)) return null;

  const n = forecast.length;
  const midpoint = inputs.discountingConvention === 'midyear' ? 0.5 : 0;

  const pvUFCFs = forecast.map((y, i) => {
    const t = i + 1;
    const df = Math.pow(1 + inputs.wacc, t - midpoint);
    return { ...y, t, pvUFCF: y.ufcf / df, discountFactor: df };
  });

  const sumPvUFCF = pvUFCFs.reduce((sum, y) => sum + y.pvUFCF, 0);

  const lastYear = forecast[n - 1];
  let terminalValue = 0;

  if (inputs.terminalMethod === 'perpetuity') {
    if (inputs.perpetuityGrowth == null || !isFinite(inputs.perpetuityGrowth) || inputs.perpetuityGrowth >= inputs.wacc) return null;
    terminalValue = (lastYear.ufcf * (1 + inputs.perpetuityGrowth)) / (inputs.wacc - inputs.perpetuityGrowth);
  } else {
    if (inputs.exitMultiple == null || !isFinite(inputs.exitMultiple)) return null;
    terminalValue = lastYear.ebitda * inputs.exitMultiple;
  }

  const tvDiscountFactor = Math.pow(1 + inputs.wacc, n);
  const pvTerminal = terminalValue / tvDiscountFactor;
  const enterpriseValue = sumPvUFCF + pvTerminal;
  const equityValue = enterpriseValue - (inputs.totalDebt || 0) + (inputs.cash || 0) - (inputs.nonControllingInterests || 0);
  const impliedSharePrice = inputs.fullyDilutedShares > 0 ? equityValue / inputs.fullyDilutedShares : 0;
  const upsideDownside = inputs.currentSharePrice > 0
    ? (impliedSharePrice - inputs.currentSharePrice) / inputs.currentSharePrice
    : 0;

  return {
    pvUFCFs, sumPvUFCF, terminalValue, pvTerminal, enterpriseValue, equityValue,
    impliedSharePrice, upsideDownside, terminalMethod: inputs.terminalMethod,
    tvDiscountFactor, midpoint,
  };
}

// ============================================================
// 5. Multi-Variable 2D Sensitivity Engine
// ============================================================
export function computeSensitivity(inputs, forecast, type = 'perpetuity') {
  if (!forecast || inputs.wacc == null || !isFinite(inputs.wacc)) return null;

  const n = forecast.length;
  const midpoint = inputs.discountingConvention === 'midyear' ? 0.5 : 0;
  const lastYear = forecast[n - 1];

  const waccSteps = [-0.01, -0.005, 0, 0.005, 0.01];
  const rowLabels = waccSteps.map(d => inputs.wacc + d);

  let colLabels, computeCell;

  if (type === 'perpetuity') {
    if (inputs.perpetuityGrowth == null || !isFinite(inputs.perpetuityGrowth)) return null;
    const gSteps = [-0.005, -0.0025, 0, 0.0025, 0.005];
    colLabels = gSteps.map(d => inputs.perpetuityGrowth + d);

    computeCell = (wacc, g) => {
      if (g >= wacc) return NaN;
      const pvUFCF = forecast.reduce((sum, y, i) => sum + y.ufcf / Math.pow(1 + wacc, (i + 1) - midpoint), 0);
      const tv = (lastYear.ufcf * (1 + g)) / (wacc - g);
      const pvTV = tv / Math.pow(1 + wacc, n);
      return pvUFCF + pvTV;
    };
  } else {
    if (inputs.exitMultiple == null || !isFinite(inputs.exitMultiple)) return null;
    const multSteps = [-2.0, -1.0, 0, 1.0, 2.0];
    colLabels = multSteps.map(d => inputs.exitMultiple + d);

    computeCell = (wacc, multiple) => {
      const pvUFCF = forecast.reduce((sum, y, i) => sum + y.ufcf / Math.pow(1 + wacc, (i + 1) - midpoint), 0);
      const tv = lastYear.ebitda * multiple;
      const pvTV = tv / Math.pow(1 + wacc, n);
      return pvUFCF + pvTV;
    };
  }

  const matrix = rowLabels.map(wacc => colLabels.map(col => computeCell(wacc, col)));
  return { rowLabels, colLabels, matrix, type };
}

// ============================================================
// Full Model Assembly
// ============================================================
export function computeFullModel(inputs) {
  try {
    const forecast = computeForecast(inputs);
    if (!forecast) return null;
    const valuation = computeValuation(inputs, forecast);
    if (!valuation) return null;
    const sensitivityGrowth = computeSensitivity(inputs, forecast, 'perpetuity');
    const sensitivityMultiple = computeSensitivity(inputs, forecast, 'multiple');
    return { forecast, valuation, sensitivityGrowth, sensitivityMultiple };
  } catch (e) {
    return null;
  }
}

// ============================================================
// Formatting Utilities
// ============================================================
export function fmtCurrency(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(decimals)}M`;
}

export function fmtPercent(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}${Math.abs(value * 100).toFixed(decimals)}%`;
}

export function fmtPrice(value, decimals = 2) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(decimals)}`;
}

export function fmtMultiple(value, decimals = 1) {
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) return '—';
  return `${value.toFixed(decimals)}x`;
}

// Heatmap color: red (low) → yellow (mid) → green (high)
export function heatmapColor(value, min, max) {
  if (isNaN(value) || !isFinite(value)) return 'rgba(100, 116, 139, 0.15)';
  if (max === min) return 'rgba(59, 130, 246, 0.25)';
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = ratio * 120;
  const lightness = 35 + ratio * 15;
  return `hsl(${hue}, 65%, ${lightness}%)`;
}
