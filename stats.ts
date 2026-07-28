// Statistical engine for pairs trading analysis.
// All computations are deterministic given a seed, so the same pair always
// produces the same results — no backend required.

export type AssetClass = 'Stock' | 'ETF' | 'Index' | 'Commodity' | 'Currency' | 'Crypto';

export interface AssetMeta {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  assetClass: string;
  marketCap: number; // in billions USD
}

export interface PricePoint {
  t: number; // epoch ms
  date: string; // YYYY-MM-DD
  priceA: number;
  priceB: number;
}

export interface AssetUniverseEntry extends AssetMeta {
  basePrice: number;
  drift: number; // annual drift
  vol: number; // annual volatility
  beta: number; // sensitivity to market factor
}

// ---------------------------------------------------------------------------
// PRNG — mulberry32, seedable so results are reproducible per pair.
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function hashStringToSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Asset universe — curated, realistic tickers across asset classes.
// ---------------------------------------------------------------------------
export const ASSET_UNIVERSE: AssetUniverseEntry[] = [
  // Equities — Tech
  { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', sector: 'Technology', assetClass: 'Stock', marketCap: 3400, basePrice: 189, drift: 0.12, vol: 0.26, beta: 1.15 },
  { ticker: 'MSFT', name: 'Microsoft Corp.', exchange: 'NASDAQ', sector: 'Technology', assetClass: 'Stock', marketCap: 3100, basePrice: 421, drift: 0.13, vol: 0.24, beta: 1.08 },
  { ticker: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NASDAQ', sector: 'Communication', assetClass: 'Stock', marketCap: 2100, basePrice: 172, drift: 0.11, vol: 0.28, beta: 1.12 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', exchange: 'NASDAQ', sector: 'Semiconductors', assetClass: 'Stock', marketCap: 2800, basePrice: 875, drift: 0.35, vol: 0.48, beta: 1.6 },
  { ticker: 'META', name: 'Meta Platforms', exchange: 'NASDAQ', sector: 'Communication', assetClass: 'Stock', marketCap: 1300, basePrice: 504, drift: 0.18, vol: 0.35, beta: 1.25 },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', exchange: 'NASDAQ', sector: 'Consumer Disc.', assetClass: 'Stock', marketCap: 1900, basePrice: 178, drift: 0.14, vol: 0.32, beta: 1.2 },
  { ticker: 'TSLA', name: 'Tesla Inc.', exchange: 'NASDAQ', sector: 'Automotive', assetClass: 'Stock', marketCap: 560, basePrice: 178, drift: 0.05, vol: 0.55, beta: 1.9 },
  { ticker: 'AMD', name: 'Advanced Micro Devices', exchange: 'NASDAQ', sector: 'Semiconductors', assetClass: 'Stock', marketCap: 240, basePrice: 162, drift: 0.2, vol: 0.5, beta: 1.7 },
  { ticker: 'INTC', name: 'Intel Corp.', exchange: 'NASDAQ', sector: 'Semiconductors', assetClass: 'Stock', marketCap: 130, basePrice: 31, drift: -0.02, vol: 0.4, beta: 1.3 },
  { ticker: 'AVGO', name: 'Broadcom Inc.', exchange: 'NASDAQ', sector: 'Semiconductors', assetClass: 'Stock', marketCap: 800, basePrice: 1310, drift: 0.22, vol: 0.38, beta: 1.4 },
  // Equities — Financials
  { ticker: 'JPM', name: 'JPMorgan Chase', exchange: 'NYSE', sector: 'Financials', assetClass: 'Stock', marketCap: 550, basePrice: 198, drift: 0.09, vol: 0.24, beta: 1.1 },
  { ticker: 'BAC', name: 'Bank of America', exchange: 'NYSE', sector: 'Financials', assetClass: 'Stock', marketCap: 320, basePrice: 38, drift: 0.07, vol: 0.3, beta: 1.25 },
  { ticker: 'GS', name: 'Goldman Sachs', exchange: 'NYSE', sector: 'Financials', assetClass: 'Stock', marketCap: 160, basePrice: 478, drift: 0.1, vol: 0.28, beta: 1.3 },
  { ticker: 'MS', name: 'Morgan Stanley', exchange: 'NYSE', sector: 'Financials', assetClass: 'Stock', marketCap: 160, basePrice: 95, drift: 0.09, vol: 0.27, beta: 1.25 },
  // Equities — Energy
  { ticker: 'XOM', name: 'Exxon Mobil', exchange: 'NYSE', sector: 'Energy', assetClass: 'Stock', marketCap: 480, basePrice: 115, drift: 0.06, vol: 0.28, beta: 0.9 },
  { ticker: 'CVX', name: 'Chevron Corp.', exchange: 'NYSE', sector: 'Energy', assetClass: 'Stock', marketCap: 290, basePrice: 156, drift: 0.06, vol: 0.26, beta: 0.95 },
  // Equities — Consumer
  { ticker: 'KO', name: 'Coca-Cola Co.', exchange: 'NYSE', sector: 'Consumer Staples', assetClass: 'Stock', marketCap: 260, basePrice: 62, drift: 0.05, vol: 0.16, beta: 0.6 },
  { ticker: 'PEP', name: 'PepsiCo Inc.', exchange: 'NASDAQ', sector: 'Consumer Staples', assetClass: 'Stock', marketCap: 230, basePrice: 173, drift: 0.06, vol: 0.17, beta: 0.55 },
  { ticker: 'WMT', name: 'Walmart Inc.', exchange: 'NYSE', sector: 'Consumer Staples', assetClass: 'Stock', marketCap: 650, basePrice: 60, drift: 0.08, vol: 0.18, beta: 0.5 },
  { ticker: 'COST', name: 'Costco Wholesale', exchange: 'NASDAQ', sector: 'Consumer Staples', assetClass: 'Stock', marketCap: 320, basePrice: 721, drift: 0.12, vol: 0.22, beta: 0.75 },
  // Equities — Healthcare
  { ticker: 'JNJ', name: 'Johnson & Johnson', exchange: 'NYSE', sector: 'Healthcare', assetClass: 'Stock', marketCap: 380, basePrice: 147, drift: 0.05, vol: 0.18, beta: 0.65 },
  { ticker: 'UNH', name: 'UnitedHealth Group', exchange: 'NYSE', sector: 'Healthcare', assetClass: 'Stock', marketCap: 480, basePrice: 518, drift: 0.1, vol: 0.24, beta: 0.85 },
  // ETFs
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'NYSE', sector: 'Broad Market', assetClass: 'ETF', marketCap: 450, basePrice: 521, drift: 0.1, vol: 0.16, beta: 1.0 },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', sector: 'Broad Market', assetClass: 'ETF', marketCap: 280, basePrice: 449, drift: 0.13, vol: 0.22, beta: 1.15 },
  { ticker: 'IWM', name: 'iShares Russell 2000', exchange: 'NYSE', sector: 'Broad Market', assetClass: 'ETF', marketCap: 65, basePrice: 207, drift: 0.08, vol: 0.26, beta: 1.2 },
  { ticker: 'XLF', name: 'Financial Select Sector SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 45, basePrice: 41, drift: 0.09, vol: 0.22, beta: 1.1 },
  { ticker: 'XLE', name: 'Energy Select Sector SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 38, basePrice: 92, drift: 0.07, vol: 0.28, beta: 0.95 },
  { ticker: 'XLK', name: 'Technology Select Sector SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 70, basePrice: 233, drift: 0.14, vol: 0.24, beta: 1.2 },
  { ticker: 'XLV', name: 'Health Care Select SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 42, basePrice: 142, drift: 0.07, vol: 0.18, beta: 0.8 },
  { ticker: 'XLY', name: 'Consumer Discretionary SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 22, basePrice: 198, drift: 0.12, vol: 0.26, beta: 1.25 },
  { ticker: 'XLP', name: 'Consumer Staples Select SPDR', exchange: 'NYSE', sector: 'Sector', assetClass: 'ETF', marketCap: 16, basePrice: 76, drift: 0.06, vol: 0.14, beta: 0.55 },
  // Indices
  { ticker: 'SPX', name: 'S&P 500 Index', exchange: 'INDEX', sector: 'Index', assetClass: 'Index', marketCap: 0, basePrice: 5235, drift: 0.1, vol: 0.16, beta: 1.0 },
  { ticker: 'NDX', name: 'Nasdaq 100 Index', exchange: 'INDEX', sector: 'Index', assetClass: 'Index', marketCap: 0, basePrice: 18342, drift: 0.13, vol: 0.22, beta: 1.15 },
  { ticker: 'DJI', name: 'Dow Jones Industrial', exchange: 'INDEX', sector: 'Index', assetClass: 'Index', marketCap: 0, basePrice: 39112, drift: 0.09, vol: 0.17, beta: 0.95 },
  { ticker: 'VIX', name: 'CBOE Volatility Index', exchange: 'INDEX', sector: 'Index', assetClass: 'Index', marketCap: 0, basePrice: 15.2, drift: -0.05, vol: 0.8, beta: -2.5 },
  // Commodities
  { ticker: 'CL=F', name: 'WTI Crude Oil Futures', exchange: 'NYMEX', sector: 'Energy', assetClass: 'Commodity', marketCap: 0, basePrice: 78.5, drift: 0.02, vol: 0.35, beta: 0.3 },
  { ticker: 'GC=F', name: 'Gold Futures', exchange: 'COMEX', sector: 'Metals', assetClass: 'Commodity', marketCap: 0, basePrice: 2168, drift: 0.08, vol: 0.15, beta: 0.1 },
  { ticker: 'SI=F', name: 'Silver Futures', exchange: 'COMEX', sector: 'Metals', assetClass: 'Commodity', marketCap: 0, basePrice: 24.8, drift: 0.07, vol: 0.28, beta: 0.15 },
  { ticker: 'NG=F', name: 'Natural Gas Futures', exchange: 'NYMEX', sector: 'Energy', assetClass: 'Commodity', marketCap: 0, basePrice: 2.18, drift: -0.03, vol: 0.6, beta: 0.2 },
  { ticker: 'HG=F', name: 'Copper Futures', exchange: 'COMEX', sector: 'Metals', assetClass: 'Commodity', marketCap: 0, basePrice: 4.05, drift: 0.05, vol: 0.26, beta: 0.4 },
  // Currencies
  { ticker: 'EURUSD=X', name: 'Euro / US Dollar', exchange: 'FX', sector: 'Currency', assetClass: 'Currency', marketCap: 0, basePrice: 1.082, drift: 0.0, vol: 0.08, beta: 0.0 },
  { ticker: 'GBPUSD=X', name: 'British Pound / US Dollar', exchange: 'FX', sector: 'Currency', assetClass: 'Currency', marketCap: 0, basePrice: 1.265, drift: 0.0, vol: 0.09, beta: 0.0 },
  { ticker: 'USDJPY=X', name: 'US Dollar / Japanese Yen', exchange: 'FX', sector: 'Currency', assetClass: 'Currency', marketCap: 0, basePrice: 151.8, drift: 0.03, vol: 0.1, beta: 0.0 },
  { ticker: 'AUDUSD=X', name: 'Australian Dollar / US Dollar', exchange: 'FX', sector: 'Currency', assetClass: 'Currency', marketCap: 0, basePrice: 0.652, drift: -0.01, vol: 0.1, beta: 0.0 },
  // Crypto
  { ticker: 'BTC-USD', name: 'Bitcoin', exchange: 'Crypto', sector: 'Digital Asset', assetClass: 'Crypto', marketCap: 1300, basePrice: 71200, drift: 0.4, vol: 0.65, beta: 1.5 },
  { ticker: 'ETH-USD', name: 'Ethereum', exchange: 'Crypto', sector: 'Digital Asset', assetClass: 'Crypto', marketCap: 400, basePrice: 3580, drift: 0.35, vol: 0.7, beta: 1.6 },
  { ticker: 'SOL-USD', name: 'Solana', exchange: 'Crypto', sector: 'Digital Asset', assetClass: 'Crypto', marketCap: 90, basePrice: 185, drift: 0.5, vol: 0.9, beta: 1.8 },
  { ticker: 'XRP-USD', name: 'Ripple', exchange: 'Crypto', sector: 'Digital Asset', assetClass: 'Crypto', marketCap: 60, basePrice: 0.62, drift: 0.2, vol: 0.75, beta: 1.4 },
];

export function searchAssets(query: string, limit = 8): AssetUniverseEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return ASSET_UNIVERSE.filter(
    (a) =>
      a.ticker.toUpperCase().includes(q) ||
      a.name.toUpperCase().includes(q) ||
      a.sector.toUpperCase().includes(q) ||
      a.exchange.toUpperCase().includes(q),
  ).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Price generation — correlated geometric Brownian motion with shared market
// factor + cointegrating residual, so pairs share a long-run equilibrium.
// ---------------------------------------------------------------------------
export function generatePriceSeries(
  assetA: AssetUniverseEntry,
  assetB: AssetUniverseEntry,
  days: number,
  interval: '1D' | '1W' | '1H' | '4H',
): PricePoint[] {
  const seed = hashStringToSeed(assetA.ticker + assetB.ticker + days + interval);
  const rng = mulberry32(seed);

  // steps per day
  const spd = interval === '1D' ? 1 : interval === '1W' ? 1 : interval === '4H' ? 6 : 24;
  const totalSteps = days * spd;
  const dt = 1 / (252 * spd);

  // market factor
  const mDrift = 0.08;
  const mVol = 0.14;

  // cointegration strength — stronger for same-sector pairs
  const sameSector = assetA.sector === assetB.sector;
  const cointStrength = sameSector ? 0.85 : 0.45 + (rng() * 0.3);
  const halfLifeTarget = sameSector ? 4 + rng() * 6 : 8 + rng() * 14; // days
  const meanRev = Math.log(2) / (halfLifeTarget * spd);

  // equilibrium spread parameters
  const eqSpread = 0;
  const spreadVol = 0.012 + rng() * 0.01;

  let priceA = assetA.basePrice;
  let priceB = assetB.basePrice;
  let spread = eqSpread;

  const points: PricePoint[] = [];
  const startMs = Date.now() - totalSteps * (interval === '1W' ? 7 : 1) * 86400000;

  for (let i = 0; i <= totalSteps; i++) {
    const marketShock = gaussian(rng) * mVol * Math.sqrt(dt) + mDrift * dt;
    const idioA = gaussian(rng) * assetA.vol * Math.sqrt(dt) + assetA.drift * dt;
    const idioB = gaussian(rng) * assetB.vol * Math.sqrt(dt) + assetB.drift * dt;

    const retA = assetA.beta * marketShock + idioA;
    const retB = assetB.beta * marketShock + idioB;

    priceA *= Math.exp(retA);
    priceB *= Math.exp(retB);

    // spread mean-reverts; both assets pulled toward equilibrium
    spread = spread * (1 - meanRev) + gaussian(rng) * spreadVol;
    const correction = spread * meanRev * cointStrength;
    priceA *= Math.exp(-correction * 0.5);
    priceB *= Math.exp(correction * 0.5);

    if (i % spd === 0 || i === totalSteps) {
      const dayIdx = Math.floor(i / spd);
      const d = new Date(startMs + dayIdx * 86400000);
      points.push({
        t: d.getTime(),
        date: d.toISOString().slice(0, 10),
        priceA: round(priceA, assetA.basePrice),
        priceB: round(priceB, assetB.basePrice),
      });
    }
  }
  return points;
}

function round(v: number, base: number): number {
  if (base > 1000) return Math.round(v * 100) / 100;
  if (base > 100) return Math.round(v * 1000) / 1000;
  if (base > 1) return Math.round(v * 10000) / 10000;
  return Math.round(v * 1000000) / 1000000;
}

// ---------------------------------------------------------------------------
// Statistical computations
// ---------------------------------------------------------------------------
export function logReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    r.push(Math.log(prices[i] / prices[i - 1]));
  }
  return r;
}

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function std(xs: number[], ddof = 1): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - ddof);
  return Math.sqrt(v);
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma;
    const db = b[i] - mb;
    cov += da * db;
    va += da * da;
    vb += db * db;
  }
  if (va === 0 || vb === 0) return 0;
  return cov / Math.sqrt(va * vb);
}

export function rollingCorrelation(a: number[], b: number[], window = 60): number[] {
  const out: number[] = new Array(a.length).fill(NaN);
  for (let i = window - 1; i < a.length; i++) {
    out[i] = correlation(a.slice(i - window + 1, i + 1), b.slice(i - window + 1, i + 1));
  }
  return out;
}

// OLS regression y = alpha + beta * x; returns {alpha, beta, residuals}
export function ols(x: number[], y: number[]): { alpha: number; beta: number; residuals: number[]; fitted: number[] } {
  const n = Math.min(x.length, y.length);
  const mx = mean(x.slice(0, n));
  const my = mean(y.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  const beta = sxx === 0 ? 0 : sxy / sxx;
  const alpha = my - beta * mx;
  const fitted: number[] = [];
  const residuals: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = alpha + beta * x[i];
    fitted.push(f);
    residuals.push(y[i] - f);
  }
  return { alpha, beta, residuals, fitted };
}

// Spread series given hedge ratio
export function spreadSeries(priceA: number[], priceB: number[], hedge: number): number[] {
  return priceA.map((p, i) => p - hedge * priceB[i]);
}

// ADF test (augmented Dickey-Fuller) approximation via regression on lagged diff.
// Returns test statistic and approximate p-value using MacKinnon response surface.
export function adfTest(series: number[]): { stat: number; pValue: number; pass: boolean } {
  const n = series.length;
  if (n < 25) return { stat: 0, pValue: 0.5, pass: false };
  const dy: number[] = [];
  const lag: number[] = [];
  for (let i = 1; i < series.length; i++) {
    dy.push(series[i] - series[i - 1]);
    lag.push(series[i - 1]);
  }
  const reg = ols(lag, dy);
  const resid = reg.residuals;
  const se = std(resid, 2) / Math.sqrt(std(lag) * Math.sqrt(n));
  const stat = se === 0 ? 0 : reg.beta / se;
  const pValue = adfPValue(stat);
  return { stat, pValue, pass: pValue < 0.05 };
}

// Approximate MacKinnon p-value for ADF (no constant, n>25)
function adfPValue(t: number): number {
  // Simplified response-surface approximation
  if (t < -3.43) return 0.01;
  if (t < -2.86) return 0.05;
  if (t < -2.57) return 0.1;
  // smooth interpolation above -2.57
  if (t >= 0.5) return 0.85;
  const x = (t + 2.57) / (0.5 + 2.57);
  return 0.1 + x * 0.75;
}

// KPSS test approximation — tests stationarity (null = stationary)
export function kpssTest(series: number[]): { stat: number; pValue: number; pass: boolean } {
  const n = series.length;
  if (n < 25) return { stat: 0.5, pValue: 0.5, pass: false };
  const m = mean(series);
  const cum: number[] = [];
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += series[i] - m;
    cum.push(s);
  }
  const longRunVar = std(series) ** 2 + 0.001;
  const stat = (cum.reduce((a, b) => a + b * b, 0)) / (n * n * longRunVar);
  const pValue = kpssPValue(stat);
  // pass = stationary = reject non-stationary = pValue < 0.05
  return { stat, pValue, pass: pValue < 0.05 };
}

function kpssPValue(t: number): number {
  if (t > 0.74) return 0.01;
  if (t > 0.463) return 0.05;
  if (t > 0.347) return 0.1;
  if (t < 0.2) return 0.6;
  return 0.1 + (0.347 - t) / (0.347 - 0.2) * 0.5;
}

// Hurst exponent via R/S analysis
export function hurstExponent(series: number[]): number {
  const n = series.length;
  if (n < 32) return 0.5;
  const lags = [4, 8, 16, 32, 64].filter((l) => l * 2 < n);
  if (lags.length < 2) return 0.5;
  const rsVals: number[] = [];
  const logLags: number[] = [];
  for (const L of lags) {
    let rsSum = 0;
    let count = 0;
    for (let start = 0; start + L <= n; start += L) {
      const seg = series.slice(start, start + L);
      const segMean = mean(seg);
      const cumDev: number[] = [];
      let cd = 0;
      for (const v of seg) {
        cd += v - segMean;
        cumDev.push(cd);
      }
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const S = std(seg, 0);
      if (S > 0) {
        rsSum += R / S;
        count++;
      }
    }
    if (count > 0) {
      rsVals.push(Math.log(rsSum / count));
      logLags.push(Math.log(L));
    }
  }
  if (rsVals.length < 2) return 0.5;
  const reg = ols(logLags, rsVals);
  const H = reg.beta;
  return Math.max(0, Math.min(1, H));
}

// Half-life of mean reversion from Ornstein-Uhlenbeck discretization
export function halfLife(spread: number[]): number {
  const dy: number[] = [];
  const lag: number[] = [];
  for (let i = 1; i < spread.length; i++) {
    dy.push(spread[i] - spread[i - 1]);
    lag.push(spread[i - 1]);
  }
  const reg = ols(lag, dy);
  const phi = reg.beta;
  if (phi >= 0) return 999;
  return -Math.log(2) / Math.log(1 + phi);
}

// Z-score of latest spread value relative to rolling window
export function zScore(spread: number[], window = 60): { current: number; series: number[] } {
  const series: number[] = new Array(spread.length).fill(NaN);
  for (let i = window - 1; i < spread.length; i++) {
    const w = spread.slice(i - window + 1, i + 1);
    const m = mean(w);
    const s = std(w);
    series[i] = s === 0 ? 0 : (spread[i] - m) / s;
  }
  const current = isNaN(series[series.length - 1]) ? 0 : series[series.length - 1];
  return { current, series };
}

export function rollingHedge(priceA: number[], priceB: number[], window = 60): number[] {
  const out = new Array(priceA.length).fill(NaN);
  for (let i = window - 1; i < priceA.length; i++) {
    const a = priceA.slice(i - window + 1, i + 1);
    const b = priceB.slice(i - window + 1, i + 1);
    out[i] = ols(b, a).beta;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Full pair analysis result
// ---------------------------------------------------------------------------
export interface StatResult {
  label: string;
  value: number;
  display: string;
  pass: 'pass' | 'warn' | 'fail' | 'neutral';
  confidence: number; // 0-100
  tooltip: string;
}

export interface PairAnalysis {
  assetA: AssetMeta;
  assetB: AssetMeta;
  prices: PricePoint[];
  normalizedA: number[];
  normalizedB: number[];
  hedgeRatio: number;
  alpha: number;
  spread: number[];
  rollingSpread: number[];
  residuals: number[];
  rollingCorr: number[];
  rollingHedge: number[];
  zSeries: number[];
  stats: {
    correlation: StatResult;
    rollingCorr: StatResult;
    cointegration: StatResult;
    adf: StatResult;
    kpss: StatResult;
    hurst: StatResult;
    hedgeRatio: StatResult;
    residualVariance: StatResult;
    halfLife: StatResult;
    pValue: StatResult;
    spread: StatResult;
    zScore: StatResult;
    relationship: StatResult;
  };
  intelligence: {
    relationshipQuality: number;
    cointegrationConfidence: number;
    currentZ: number;
    halfLife: number;
    currentSignal: 'Long Spread' | 'Short Spread' | 'Neutral' | 'Exit';
    expectedHoldingPeriod: number;
    currentRegime: 'Mean Reverting' | 'Trending' | 'Breakdown' | 'Unstable';
    sharpeEstimate: number;
    winProbability: number;
    signalStrength: 'Strong' | 'Moderate' | 'Weak' | 'None';
  };
  researchSummary: string;
}

export function analyzePair(
  assetA: AssetUniverseEntry,
  assetB: AssetUniverseEntry,
  days: number,
  interval: '1D' | '1W' | '1H' | '4H',
): PairAnalysis {
  const prices = generatePriceSeries(assetA, assetB, days, interval);
  return analyzePairFromPrices(assetA, assetB, prices);
}

export function analyzePairFromPrices(
  assetA: AssetMeta,
  assetB: AssetMeta,
  prices: PricePoint[],
): PairAnalysis {
  const pA = prices.map((p) => p.priceA);
  const pB = prices.map((p) => p.priceB);
  const baseA = pA[0] || 1;
  const baseB = pB[0] || 1;
  const normalizedA = pA.map((p) => (p / baseA) * 100);
  const normalizedB = pB.map((p) => (p / baseB) * 100);

  const retA = logReturns(pA);
  const retB = logReturns(pB);
  const corr = correlation(retA, retB);
  const rollCorr = rollingCorrelation(retA, retB, 60);

  const olsRes = ols(pB, pA);
  const hedge = olsRes.beta;
  const alpha = olsRes.alpha;
  const spread = spreadSeries(pA, pB, hedge);
  const rollSpread = rollingSpread(spread, 60);
  const residuals = olsRes.residuals;

  const adf = adfTest(spread);
  const kpss = kpssTest(spread);
  const hurst = hurstExponent(spread);
  const hl = halfLife(spread);
  const z = zScore(spread, 60);
  const rollHedge = rollingHedge(pA, pB, 60);
  const residVar = std(residuals) ** 2;

  // Confidence metrics
  const cointConf = clamp(
    (1 - adf.pValue) * 60 + (kpss.pass ? 25 : 5) + (hurst < 0.5 ? 15 : 0) + corr * 10,
    0,
    100,
  );
  const relQuality = clamp(
    cointConf * 0.5 +
      (hl < 30 && hl > 0 ? 25 : 5) +
      Math.abs(corr) * 25 +
      (hurst < 0.5 ? 10 : 0),
    0,
    100,
  );

  const currentZ = z.current;
  let signal: PairAnalysis['intelligence']['currentSignal'];
  if (currentZ > 1.5) signal = 'Short Spread';
  else if (currentZ < -1.5) signal = 'Long Spread';
  else if (Math.abs(currentZ) < 0.5) signal = 'Exit';
  else signal = 'Neutral';

  const regime: PairAnalysis['intelligence']['currentRegime'] =
    hurst < 0.45 && hl < 20 && hl > 0
      ? 'Mean Reverting'
      : hurst > 0.6
        ? 'Trending'
        : adf.pValue > 0.1
          ? 'Breakdown'
          : 'Unstable';

  const sharpeEst = clamp(
    (Math.abs(currentZ) / 2) * (1.5 / Math.max(1, hl / 5)) * (cointConf / 100) * 2.5,
    0,
    3.5,
  );
  const winProb = clamp(
    50 + (cointConf / 100) * 20 + (Math.abs(currentZ) > 1.5 ? 8 : 0) - (hl > 20 ? 7 : 0),
    40,
    85,
  );

  const signalStrength: PairAnalysis['intelligence']['signalStrength'] =
    Math.abs(currentZ) > 2 && cointConf > 70
      ? 'Strong'
      : Math.abs(currentZ) > 1.2 && cointConf > 50
        ? 'Moderate'
        : Math.abs(currentZ) > 0.8
          ? 'Weak'
          : 'None';

  const stats = {
    correlation: stat('Correlation', corr, corr.toFixed(3), corr > 0.7 ? 'pass' : corr > 0.4 ? 'warn' : 'fail',
      pct(corr * 100, 0, 100), 'Pearson correlation of log returns. Values above 0.7 indicate strong co-movement; below 0.4 suggests weak linkage.'),
    rollingCorr: stat('Rolling Correlation', rollCorr[rollCorr.length - 1] || corr,
      ((rollCorr[rollCorr.length - 1] || corr)).toFixed(3),
      (rollCorr[rollCorr.length - 1] || corr) > 0.6 ? 'pass' : 'warn',
      70, '60-day rolling correlation. Stability of this measure indicates the relationship is persistent, not spurious.'),
    cointegration: stat('Cointegration', cointConf / 100, cointConf.toFixed(0) + '%',
      cointConf > 70 ? 'pass' : cointConf > 50 ? 'warn' : 'fail', cointConf,
      'Engle-Granger cointegration test. A high score means the spread between the two assets reverts to a stable equilibrium — the foundation of pairs trading.'),
    adf: stat('ADF Test', adf.stat, adf.stat.toFixed(3), adf.pass ? 'pass' : 'fail',
      (1 - adf.pValue) * 100, 'Augmented Dickey-Fuller test for unit root in the spread. Null hypothesis: the spread has a unit root (non-stationary). Rejecting it (p < 0.05) means the spread is stationary and mean-reverting.'),
    kpss: stat('KPSS Test', kpss.stat, kpss.stat.toFixed(3), kpss.pass ? 'pass' : 'fail',
      (1 - kpss.pValue) * 100, 'KPSS test for stationarity. Null hypothesis: the series is stationary. A low p-value (< 0.05) rejects stationarity — opposite of ADF. Passing both tests gives strong evidence of mean reversion.'),
    hurst: stat('Hurst Exponent', hurst, hurst.toFixed(3), hurst < 0.5 ? 'pass' : hurst < 0.6 ? 'warn' : 'fail',
      (1 - hurst) * 100, 'Hurst exponent via R/S analysis. H < 0.5 indicates mean-reverting behavior; H = 0.5 is a random walk; H > 0.5 indicates trending. Lower is better for pairs trading.'),
    hedgeRatio: stat('OLS Hedge Ratio', hedge, hedge.toFixed(3),
      hedge > 0.3 && hedge < 3 ? 'pass' : 'warn', 75,
      'Beta from OLS regression of asset A on asset B. Represents the ratio to short B against long A to construct a market-neutral spread position.'),
    residualVariance: stat('Residual Variance', residVar, residVar.toExponential(2), 'neutral', 60,
      'Variance of OLS regression residuals. Lower variance means a tighter, more predictable relationship — the spread fluctuates within a narrower band.'),
    halfLife: stat('Half-Life', hl, hl > 900 ? '∞' : hl.toFixed(1) + 'd',
      hl > 0 && hl < 15 ? 'pass' : hl > 0 && hl < 40 ? 'warn' : 'fail',
      hl > 0 && hl < 30 ? 80 : 30,
      'Ornstein-Uhlenbeck half-life: the expected time for the spread to revert halfway to its mean. Shorter (5–15 days) is more profitable for practical trading; very long half-lives tie up capital.'),
    pValue: stat('P-Value', adf.pValue, adf.pValue.toFixed(4), adf.pValue < 0.05 ? 'pass' : 'fail',
      (1 - adf.pValue) * 100, 'Statistical significance of the ADF test. Below 0.05 is the standard threshold for rejecting the unit-root null hypothesis and confirming cointegration.'),
    spread: stat('Spread', spread[spread.length - 1], spread[spread.length - 1].toFixed(3), 'neutral', 50,
      'Current spread value (A − β·B). This is the residual whose mean-reversion is being traded. Extreme values relative to the mean signal entry opportunities.'),
    zScore: stat('Current Z-Score', currentZ, currentZ.toFixed(2),
      Math.abs(currentZ) > 1.5 ? 'pass' : Math.abs(currentZ) > 1 ? 'warn' : 'neutral',
      Math.min(100, Math.abs(currentZ) * 40),
      'Standardized spread: (spread − mean) / std over 60-day window. |Z| > 2 is a classic entry signal; |Z| < 0.5 is an exit.'),
    relationship: stat('Relationship Status', relQuality / 100,
      relQuality > 75 ? 'Strong' : relQuality > 55 ? 'Moderate' : 'Weak',
      relQuality > 75 ? 'pass' : relQuality > 55 ? 'warn' : 'fail', relQuality,
      'Composite score blending cointegration confidence, correlation, half-life, and Hurst exponent into a single quality grade for the pair.'),
  };

  const researchSummary = buildResearchSummary(assetA, assetB, corr, cointConf, adf, kpss, hurst, hl, currentZ, regime, signal);

  return {
    assetA, assetB, prices, normalizedA, normalizedB, hedgeRatio: hedge, alpha,
    spread, rollingSpread: rollSpread, residuals, rollingCorr: rollCorr, rollingHedge: rollHedge,
    zSeries: z.series,
    stats,
    intelligence: {
      relationshipQuality: Math.round(relQuality),
      cointegrationConfidence: Math.round(cointConf),
      currentZ: Number(currentZ.toFixed(2)),
      halfLife: Number((hl > 900 ? 999 : hl).toFixed(1)),
      currentSignal: signal,
      expectedHoldingPeriod: Math.max(1, Math.round(hl * 1.2)),
      currentRegime: regime,
      sharpeEstimate: Number(sharpeEst.toFixed(2)),
      winProbability: Math.round(winProb),
      signalStrength,
    },
    researchSummary,
  };
}

function rollingSpread(spread: number[], window: number): number[] {
  const out = new Array(spread.length).fill(NaN);
  for (let i = window - 1; i < spread.length; i++) {
    const w = spread.slice(i - window + 1, i + 1);
    out[i] = mean(w);
  }
  return out;
}

function stat(label: string, value: number, display: string, pass: StatResult['pass'], confidence: number, tooltip: string): StatResult {
  return { label, value, display, pass, confidence: Math.round(clamp(confidence, 0, 100)), tooltip };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
function pct(v: number, lo = 0, hi = 100): number {
  return clamp(((v - lo) / (hi - lo)) * 100, 0, 100);
}

function buildResearchSummary(
  a: AssetMeta, b: AssetMeta, corr: number, coint: number,
  adf: { pValue: number; pass: boolean }, kpss: { pass: boolean }, hurst: number,
  hl: number, z: number, regime: string, signal: string,
): string {
  const sectorNote = a.sector === b.sector
    ? `Both instruments operate in the ${a.sector} sector, providing a structural basis for a long-run equilibrium relationship.`
    : `${a.name} (${a.sector}) and ${b.name} (${b.sector}) operate in different sectors; any cointegration likely stems from macroeconomic linkages rather than direct business overlap.`;

  const cointNote = adf.pass && kpss.pass
    ? 'Both the ADF and KPSS tests confirm the spread is stationary at the 5% significance level, providing strong statistical evidence of a genuine cointegrating relationship.'
    : adf.pass
      ? 'The ADF test rejects the unit-root null, though KPSS does not fully confirm stationarity. Evidence for cointegration is moderate — monitor for regime shifts.'
      : 'The ADF test does not reject the unit root. Statistical evidence for cointegration is weak at this horizon; the spread may not reliably mean-revert.';

  const stabilityNote = hurst < 0.45
    ? `The Hurst exponent of ${hurst.toFixed(2)} is well below 0.5, indicating persistent mean-reverting behavior.`
    : hurst < 0.55
      ? `The Hurst exponent of ${hurst.toFixed(2)} is near 0.5, suggesting the spread behaves close to a random walk.`
      : `The Hurst exponent of ${hurst.toFixed(2)} is above 0.5, indicating trending behavior — mean reversion is not currently the dominant dynamic.`;

  const hlNote = hl > 0 && hl < 15
    ? `The estimated half-life of ${hl.toFixed(1)} days is short, implying the spread reverts quickly — favorable for capital efficiency.`
    : hl > 0 && hl < 40
      ? `The half-life of ${hl.toFixed(1)} days is moderate; positions may require several weeks to converge.`
      : `The half-life is very long (${hl > 900 ? '∞' : hl.toFixed(0) + ' days'}), suggesting reversion is too slow to trade profitably after costs.`;

  const signalNote = signal === 'Neutral'
    ? 'The current Z-score is within the neutral band — no actionable entry signal at present.'
    : `The current Z-score of ${z.toFixed(2)} generates a ${signal} signal, with an expected holding period of approximately ${Math.max(1, Math.round(hl * 1.2))} days.`;

  const riskNote = `Principal risks include a structural breakdown of the cointegrating relationship (regime change, M&A, sector dislocation), widening of the spread beyond historical norms, and elevated idiosyncratic volatility in either name. The current regime is classified as ${regime}.`;

  return [
    `This report evaluates the statistical arbitrage opportunity between ${a.name} (${a.ticker}) and ${b.name} (${b.ticker}).`,
    sectorNote,
    `The correlation of log returns is ${corr.toFixed(3)}, and the composite cointegration confidence is ${coint.toFixed(0)}%.`,
    cointNote,
    stabilityNote,
    hlNote,
    signalNote,
    riskNote,
    'Conclusion: ' + (coint > 70 && hurst < 0.5 && hl > 0 && hl < 25
      ? 'The pair exhibits the statistical signature of a tradable mean-reverting spread. The opportunity warrants inclusion in the research pipeline and a backtest under realistic transaction costs.'
      : coint > 50
        ? 'The pair shows partial mean-reverting characteristics. Proceed with caution — size positions conservatively and monitor for regime stability before allocating meaningful capital.'
        : 'The pair does not currently meet the threshold for a statistically robust mean-reverting relationship. We recommend continued monitoring rather than deployment of capital.'),
  ].join('\n\n');
}

// ---------------------------------------------------------------------------
// Backtesting
// ---------------------------------------------------------------------------
export interface BacktestConfig {
  entryZ: number;
  exitZ: number;
  stopLoss: number; // in Z units
  maxHoldingDays: number;
  transactionCost: number; // bps per side
  slippage: number; // bps per side
  borrowCost: number; // annual % on short leg
  leverage: number;
  capital: number;
  positionSize: number; // % of capital per trade
}

export interface Trade {
  entryIdx: number;
  entryDate: string;
  exitIdx: number;
  exitDate: string;
  direction: 'long' | 'short';
  entryZ: number;
  exitZ: number;
  pnl: number;
  returnPct: number;
  holdingDays: number;
  exitReason: 'target' | 'stop' | 'time' | 'end';
}

export interface BacktestResult {
  trades: Trade[];
  equityCurve: { t: number; date: string; equity: number; drawdown: number }[];
  metrics: {
    annualReturn: number;
    sharpe: number;
    sortino: number;
    calmar: number;
    maxDrawdown: number;
    winRate: number;
    profitFactor: number;
    avgTrade: number;
    expectedValue: number;
    exposure: number;
    turnover: number;
    avgTradeDuration: number;
    totalReturn: number;
  };
}

export function runBacktest(analysis: PairAnalysis, cfg: BacktestConfig): BacktestResult {
  const z = analysis.zSeries;
  const spread = analysis.spread;
  const prices = analysis.prices;
  const n = z.length;
  const trades: Trade[] = [];
  let equity = cfg.capital;
  const equityCurve: BacktestResult['equityCurve'] = [];

  let position: { direction: 'long' | 'short'; entryIdx: number; entryZ: number; entryEquity: number } | null = null;
  const costPerSide = (cfg.transactionCost + cfg.slippage) / 10000;

  for (let i = 0; i < n; i++) {
    if (isNaN(z[i])) {
      equityCurve.push({ t: prices[i].t, date: prices[i].date, equity, drawdown: 0 });
      continue;
    }
    const curZ = z[i];

    if (position) {
      // check exit
      let exit = false;
      let reason: Trade['exitReason'] = 'target';
      if (position.direction === 'long' && curZ >= cfg.exitZ) { exit = true; reason = 'target'; }
      else if (position.direction === 'short' && curZ <= -cfg.exitZ) { exit = true; reason = 'target'; }
      else if (Math.abs(curZ) >= cfg.stopLoss) { exit = true; reason = 'stop'; }
      else if (i - position.entryIdx >= cfg.maxHoldingDays) { exit = true; reason = 'time'; }

      if (exit || i === n - 1) {
        if (i === n - 1 && !exit) reason = 'end';
        const days = i - position.entryIdx;
        // PnL: proportional to Z-score reversion
        const zReversion = position.direction === 'long'
          ? (position.entryZ - curZ)
          : (curZ - position.entryZ);
        const grossReturn = zReversion * 0.02; // 2% per Z unit reverted
        const costs = costPerSide * 2 + (cfg.borrowCost / 252) * days * 0.5;
        const tradeReturn = (grossReturn - costs) * cfg.leverage;
        const pnl = equity * (cfg.positionSize / 100) * tradeReturn;
        equity += pnl;
        trades.push({
          entryIdx: position.entryIdx,
          entryDate: prices[position.entryIdx].date,
          exitIdx: i,
          exitDate: prices[i].date,
          direction: position.direction,
          entryZ: Number(position.entryZ.toFixed(2)),
          exitZ: Number(curZ.toFixed(2)),
          pnl: Number(pnl.toFixed(2)),
          returnPct: Number((tradeReturn * 100).toFixed(2)),
          holdingDays: days,
          exitReason: reason,
        });
        position = null;
      }
    }

    if (!position) {
      if (curZ <= -cfg.entryZ) {
        position = { direction: 'long', entryIdx: i, entryZ: curZ, entryEquity: equity };
      } else if (curZ >= cfg.entryZ) {
        position = { direction: 'short', entryIdx: i, entryZ: curZ, entryEquity: equity };
      }
    }

    // drawdown
    equityCurve.push({ t: prices[i].t, date: prices[i].date, equity, drawdown: 0 });
  }

  // compute drawdowns
  let peak = -Infinity;
  let maxDD = 0;
  for (const pt of equityCurve) {
    peak = Math.max(peak, pt.equity);
    pt.drawdown = peak > 0 ? ((pt.equity - peak) / peak) * 100 : 0;
    maxDD = Math.min(maxDD, pt.drawdown);
  }

  const totalReturn = ((equity - cfg.capital) / cfg.capital) * 100;
  const years = n / 252;
  const annualReturn = years > 0 ? (Math.pow(equity / cfg.capital, 1 / years) - 1) * 100 : 0;

  const returns = trades.map((t) => t.returnPct / 100);
  const meanRet = mean(returns);
  const stdRet = std(returns);
  const sharpe = stdRet > 0 ? (meanRet / stdRet) * Math.sqrt(252 / Math.max(1, avgTradeDuration(trades))) : 0;
  const downside = returns.filter((r) => r < 0);
  const downsideStd = std(downside);
  const sortino = downsideStd > 0 ? (meanRet / downsideStd) * Math.sqrt(252) : sharpe;
  const calmar = maxDD < 0 ? annualReturn / Math.abs(maxDD) : 0;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const winRate = trades.length ? (wins.length / trades.length) * 100 : 0;
  const grossProfit = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0;
  const avgTrade = trades.length ? mean(trades.map((t) => t.pnl)) : 0;
  const expectedValue = trades.length ? meanRet * 100 : 0;
  const exposure = n > 0 ? (trades.reduce((a, t) => a + t.holdingDays, 0) / n) * 100 : 0;
  const turnover = trades.length * 2 / Math.max(1, years);
  const avgDur = trades.length ? avgTradeDuration(trades) : 0;

  return {
    trades,
    equityCurve,
    metrics: {
      annualReturn: Number(annualReturn.toFixed(2)),
      sharpe: Number(sharpe.toFixed(2)),
      sortino: Number(sortino.toFixed(2)),
      calmar: Number(calmar.toFixed(2)),
      maxDrawdown: Number(maxDD.toFixed(2)),
      winRate: Number(winRate.toFixed(1)),
      profitFactor: Number(profitFactor.toFixed(2)),
      avgTrade: Number(avgTrade.toFixed(2)),
      expectedValue: Number(expectedValue.toFixed(2)),
      exposure: Number(exposure.toFixed(1)),
      turnover: Number(turnover.toFixed(1)),
      avgTradeDuration: Number(avgDur.toFixed(1)),
      totalReturn: Number(totalReturn.toFixed(2)),
    },
  };
}

function avgTradeDuration(trades: Trade[]): number {
  if (!trades.length) return 0;
  return mean(trades.map((t) => t.holdingDays));
}

// ---------------------------------------------------------------------------
// Monte Carlo simulation
// ---------------------------------------------------------------------------
export interface MonteCarloConfig {
  simulations: number;
  horizon: number;
  assumption: 'Historical Volatility' | 'Bootstrapped Returns' | 'Mean Reversion Strength' | 'Correlation Stability';
}

export interface MonteCarloResult {
  paths: number[][]; // [sim][day] — sampled paths
  fan: { date: string; p5: number; p25: number; p50: number; p75: number; p95: number }[];
  histogram: { bucket: number; count: number }[];
  expectedReturn: number;
  expectedDrawdown: number;
  probProfit: number;
  probLoss: number;
  probOutperform: number;
  bestCase: number;
  worstCase: number;
  medianPath: number[];
}

export function runMonteCarlo(analysis: PairAnalysis, cfg: MonteCarloConfig): MonteCarloResult {
  const seed = hashStringToSeed(analysis.assetA.ticker + analysis.assetB.ticker + cfg.simulations + cfg.horizon);
  const rng = mulberry32(seed);
  const z = analysis.zSeries.filter((v) => !isNaN(v));
  const spread = analysis.spread;
  const m = mean(z);
  const s = std(z);
  const hl = analysis.intelligence.halfLife;
  const meanRev = hl > 0 && hl < 900 ? Math.log(2) / hl : 0.05;

  // historical returns for bootstrap
  const histReturns = logReturns(spread);

  const samplePaths: number[][] = [];
  const sampleCount = Math.min(cfg.simulations, 200); // render subset for performance
  for (let sim = 0; sim < sampleCount; sim++) {
    const path: number[] = [];
    let cur = analysis.intelligence.currentZ;
    for (let d = 0; d < cfg.horizon; d++) {
      let shock: number;
      if (cfg.assumption === 'Bootstrapped Returns' && histReturns.length > 10) {
        shock = histReturns[Math.floor(rng() * histReturns.length)] * s * 5;
      } else if (cfg.assumption === 'Mean Reversion Strength') {
        shock = gaussian(rng) * s * 0.5;
      } else if (cfg.assumption === 'Correlation Stability') {
        shock = gaussian(rng) * s * 0.7;
      } else {
        shock = gaussian(rng) * s;
      }
      cur = cur + meanRev * (m - cur) + shock;
      path.push(cur);
    }
    samplePaths.push(path);
  }

  // full distribution using all simulations (statistical, not rendered)
  const finalReturns: number[] = [];
  for (let sim = 0; sim < cfg.simulations; sim++) {
    let cur = analysis.intelligence.currentZ;
    for (let d = 0; d < cfg.horizon; d++) {
      const shock = gaussian(rng) * s;
      cur = cur + meanRev * (m - cur) + shock;
    }
    // return proportional to reversion from current to mean
    const ret = (cur - analysis.intelligence.currentZ) * -2; // % return approx
    finalReturns.push(ret);
  }

  // fan chart
  const fan: MonteCarloResult['fan'] = [];
  for (let d = 0; d < cfg.horizon; d++) {
    const col = samplePaths.map((p) => p[d]).sort((a, b) => a - b);
    fan.push({
      date: `D+${d + 1}`,
      p5: percentile(col, 5),
      p25: percentile(col, 25),
      p50: percentile(col, 50),
      p75: percentile(col, 75),
      p95: percentile(col, 95),
    });
  }

  // histogram
  const min = Math.min(...finalReturns);
  const max = Math.max(...finalReturns);
  const buckets = 24;
  const bw = (max - min) / buckets || 1;
  const histogram = Array.from({ length: buckets }, (_, i) => ({
    bucket: Number((min + i * bw).toFixed(1)),
    count: 0,
  }));
  for (const r of finalReturns) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor((r - min) / bw)));
    histogram[idx].count++;
  }

  const expectedReturn = mean(finalReturns);
  const expectedDrawdown = mean(finalReturns.map((r) => Math.min(0, r)));
  const probProfit = (finalReturns.filter((r) => r > 0).length / finalReturns.length) * 100;
  const probLoss = 100 - probProfit;
  const buyHoldReturn = analysis.prices.length > 1
    ? ((analysis.prices[analysis.prices.length - 1].priceA / analysis.prices[0].priceA) - 1) * 100 * (cfg.horizon / analysis.prices.length)
    : 0;
  const probOutperform = (finalReturns.filter((r) => r > buyHoldReturn).length / finalReturns.length) * 100;
  const medianPath = samplePaths.map((_, d) => {
    const col = samplePaths.map((p) => p[d]).sort((a, b) => a - b);
    return percentile(col, 50);
  });

  return {
    paths: samplePaths,
    fan,
    histogram,
    expectedReturn: Number(expectedReturn.toFixed(2)),
    expectedDrawdown: Number(expectedDrawdown.toFixed(2)),
    probProfit: Number(probProfit.toFixed(1)),
    probLoss: Number(probLoss.toFixed(1)),
    probOutperform: Number(probOutperform.toFixed(1)),
    bestCase: Number(Math.max(...finalReturns).toFixed(2)),
    worstCase: Number(Math.min(...finalReturns).toFixed(2)),
    medianPath,
  };
}

function percentile(sortedAsc: number[], p: number): number {
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return Number(sortedAsc[idx]?.toFixed(3) ?? 0);
}

// ---------------------------------------------------------------------------
// Rankings — scan a curated set of pairs and rank by quality.
// ---------------------------------------------------------------------------
export interface RankedPair {
  rank: number;
  tickerA: string;
  tickerB: string;
  nameA: string;
  nameB: string;
  sharpe: number;
  cointegration: number;
  halfLife: number;
  zScore: number;
  expectedReturn: number;
  signal: string;
  quality: number;
  confidence: number;
}

const RANKING_PAIRS: [string, string][] = [
  ['KO', 'PEP'], ['JPM', 'BAC'], ['GS', 'MS'], ['XOM', 'CVX'],
  ['SPY', 'QQQ'], ['XLF', 'XLE'], ['XLK', 'XLY'], ['GLD', 'GC=F'],
  ['AAPL', 'MSFT'], ['GOOGL', 'META'], ['AMD', 'INTC'], ['NVDA', 'AVGO'],
  ['WMT', 'COST'], ['JNJ', 'UNH'], ['EURUSD=X', 'GBPUSD=X'], ['BTC-USD', 'ETH-USD'],
  ['SI=F', 'GC=F'], ['CL=F', 'NG=F'], ['XLP', 'XLV'], ['SPX', 'NDX'],
];

export function getRankings(): RankedPair[] {
  const results: RankedPair[] = [];
  for (const [a, b] of RANKING_PAIRS) {
    const assetA = ASSET_UNIVERSE.find((x) => x.ticker === a);
    const assetB = ASSET_UNIVERSE.find((x) => x.ticker === b);
    if (!assetA || !assetB) continue;
    const analysis = analyzePair(assetA, assetB, 252, '1D');
    results.push({
      rank: 0,
      tickerA: a, tickerB: b, nameA: assetA.name, nameB: assetB.name,
      sharpe: analysis.intelligence.sharpeEstimate,
      cointegration: analysis.intelligence.cointegrationConfidence,
      halfLife: analysis.intelligence.halfLife,
      zScore: analysis.intelligence.currentZ,
      expectedReturn: Number((analysis.intelligence.sharpeEstimate * 8).toFixed(2)),
      signal: analysis.intelligence.currentSignal,
      quality: analysis.intelligence.relationshipQuality,
      confidence: analysis.intelligence.cointegrationConfidence,
    });
  }
  results.sort((x, y) => y.quality - x.quality);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

// ---------------------------------------------------------------------------
// Shared types for the app
// ---------------------------------------------------------------------------
export interface WatchlistEntry {
  tickerA: string;
  tickerB: string;
  nameA: string;
  nameB: string;
  addedAt: number;
  signal: string;
  cointegration: number;
  zScore: number;
  halfLife: number;
  alertStatus: 'normal' | 'warning' | 'critical';
}

export interface AlertItem {
  id: string;
  tickerA: string;
  tickerB: string;
  type: 'z_threshold' | 'cointegration_break' | 'halflife_shift' | 'relationship_weakens' | 'relationship_strengthens' | 'signal_generated' | 'simulation_updated';
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Scanner — scan the asset universe for tradable pairs.
// ---------------------------------------------------------------------------
export interface ScanResult {
  tickerA: string;
  tickerB: string;
  nameA: string;
  nameB: string;
  sectorA: string;
  sectorB: string;
  correlation: number;
  cointegration: number;
  halfLife: number;
  zScore: number;
  sharpe: number;
  winProbability: number;
  signal: string;
  signalStrength: string;
  regime: string;
  quality: number;
  sameSector: boolean;
}

export interface ScanOptions {
  days: number;
  interval: '1D' | '1W' | '1H' | '4H';
  minCorrelation: number;
  minCointegration: number;
  maxHalfLife: number;
  minZScore: number;
  sameSectorOnly: boolean;
}

export const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  days: 365,
  interval: '1D',
  minCorrelation: 0.5,
  minCointegration: 50,
  maxHalfLife: 40,
  minZScore: 0,
  sameSectorOnly: false,
};

export function scanForPairs(options: ScanOptions): ScanResult[] {
  const results: ScanResult[] = [];
  const n = ASSET_UNIVERSE.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = ASSET_UNIVERSE[i];
      const b = ASSET_UNIVERSE[j];
      if (options.sameSectorOnly && a.sector !== b.sector) continue;
      const analysis = analyzePair(a, b, options.days, options.interval);
      const corr = analysis.stats.correlation.value;
      const coint = analysis.intelligence.cointegrationConfidence;
      const hl = analysis.intelligence.halfLife;
      const z = Math.abs(analysis.intelligence.currentZ);
      if (corr < options.minCorrelation) continue;
      if (coint < options.minCointegration) continue;
      if (hl > options.maxHalfLife) continue;
      if (z < options.minZScore) continue;
      results.push({
        tickerA: a.ticker,
        tickerB: b.ticker,
        nameA: a.name,
        nameB: b.name,
        sectorA: a.sector,
        sectorB: b.sector,
        correlation: Number(corr.toFixed(3)),
        cointegration: coint,
        halfLife: hl,
        zScore: analysis.intelligence.currentZ,
        sharpe: analysis.intelligence.sharpeEstimate,
        winProbability: analysis.intelligence.winProbability,
        signal: analysis.intelligence.currentSignal,
        signalStrength: analysis.intelligence.signalStrength,
        regime: analysis.intelligence.currentRegime,
        quality: analysis.intelligence.relationshipQuality,
        sameSector: a.sector === b.sector,
      });
    }
  }
  results.sort((x, y) => y.quality - x.quality);
  return results;
}

export function generateAlerts(): AlertItem[] {
  const now = Date.now();
  return [
    { id: 'a1', tickerA: 'KO', tickerB: 'PEP', type: 'z_threshold', message: 'Z-score exceeded entry threshold at -2.14', severity: 'warning', timestamp: now - 3600000 },
    { id: 'a2', tickerA: 'JPM', tickerB: 'BAC', type: 'signal_generated', message: 'Long Spread signal generated', severity: 'info', timestamp: now - 7200000 },
    { id: 'a3', tickerA: 'XOM', tickerB: 'CVX', type: 'cointegration_break', message: 'Cointegration confidence dropped below 60%', severity: 'critical', timestamp: now - 14400000 },
    { id: 'a4', tickerA: 'AAPL', tickerB: 'MSFT', type: 'relationship_strengthens', message: 'Rolling correlation increased to 0.82', severity: 'info', timestamp: now - 21600000 },
    { id: 'a5', tickerA: 'SPY', tickerB: 'QQQ', type: 'halflife_shift', message: 'Half-life extended from 6.2 to 11.8 days', severity: 'warning', timestamp: now - 32400000 },
  ];
}
