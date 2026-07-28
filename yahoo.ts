// Frontend module for fetching real market data from Yahoo Finance via the
// yahoo-finance Supabase edge function. Includes a local asset universe
// fallback so the app remains usable if the network is unavailable.

import { ASSET_UNIVERSE } from '@/lib/stats';

export interface YahooAsset {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchange?: string;
  quoteType?: string;
  sector?: string;
  industry?: string;
  marketCap?: number;
}

export interface PricePoint {
  t: number;
  date: string;
  price: number;
}

export interface AssetInfo {
  ticker: string;
  name: string;
  exchange: string;
  sector: string;
  assetClass: string;
  marketCap: number;
}

const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yahoo-finance`;
const HEADERS = {
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};

// ---------------------------------------------------------------------------
// Search — query Yahoo Finance for any asset on the market
// ---------------------------------------------------------------------------
export async function searchYahooAssets(query: string): Promise<AssetInfo[]> {
  if (!query.trim()) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(
      `${FUNCTION_URL}?action=search&q=${encodeURIComponent(query)}`,
      { headers: HEADERS, signal: controller.signal },
    );
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const json = await res.json();
    const data = json.data as { quotes?: YahooAsset[] };
    if (!data?.quotes || data.quotes.length === 0) return localSearch(query);
    const results = data.quotes
      .filter((q) => q.symbol && !q.symbol.includes('.'))
      .slice(0, 12)
      .map((q) => ({
        ticker: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || '—',
        sector: q.industry || q.sector || '—',
        assetClass: classifyAsset(q.quoteType),
        marketCap: q.marketCap || 0,
      }));
    return results.length > 0 ? results : localSearch(query);
  } catch {
    return localSearch(query);
  }
}

// Fallback search against the local ASSET_UNIVERSE when Yahoo is unreachable.
function localSearch(query: string): AssetInfo[] {
  const q = query.toLowerCase();
  return ASSET_UNIVERSE
    .filter((a) => a.ticker.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))
    .slice(0, 12)
    .map((a) => ({
      ticker: a.ticker,
      name: a.name,
      exchange: a.exchange || '—',
      sector: a.sector || '—',
      assetClass: a.assetClass,
      marketCap: a.marketCap,
    }));
}

function classifyAsset(quoteType?: string): string {
  if (!quoteType) return 'Equity';
  const t = quoteType.toUpperCase();
  if (t === 'ETF') return 'ETF';
  if (t === 'INDEX') return 'Index';
  if (t === 'CURRENCY') return 'Currency';
  if (t === 'CRYPTOCURRENCY') return 'Crypto';
  if (t === 'FUTURE') return 'Futures';
  if (t === 'MUTUALFUND') return 'Fund';
  return 'Equity';
}

// ---------------------------------------------------------------------------
// Chart — fetch historical prices for a symbol
// ---------------------------------------------------------------------------
export async function fetchYahooChart(
  symbol: string,
  range: string,
  interval: string,
): Promise<PricePoint[] | null> {
  try {
    const res = await fetch(
      `${FUNCTION_URL}?action=chart&symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`,
      { headers: HEADERS },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const data = json.data as {
      chart?: {
        result?: Array<{
          timestamp?: number[];
          indicators?: {
            quote?: Array<{ close?: number[] }>;
          };
        }>;
        error?: unknown;
      };
    };
    const result = data.chart?.result?.[0];
    if (!result?.timestamp || !result.indicators?.quote?.[0]?.close) return null;
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    const points: PricePoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const price = closes[i];
      if (price == null || isNaN(price)) continue;
      const d = new Date(timestamps[i] * 1000);
      points.push({
        t: d.getTime(),
        date: d.toISOString().slice(0, 10),
        price,
      });
    }
    return points.length > 20 ? points : null;
  } catch {
    return null;
  }
}

// Map our UI range/interval options to Yahoo Finance params
export function mapRange(days: number): string {
  if (days <= 30) return '1mo';
  if (days <= 90) return '3mo';
  if (days <= 180) return '6mo';
  if (days <= 365) return '1y';
  if (days <= 730) return '2y';
  if (days <= 1825) return '5y';
  return 'max';
}

export function mapInterval(interval: '1D' | '1W' | '4H' | '1H'): string {
  switch (interval) {
    case '1H': return '60m';
    case '4H': return '60m';
    case '1W': return '1wk';
    default: return '1d';
  }
}

// ---------------------------------------------------------------------------
// Quote — fetch current price and change for a set of symbols
// ---------------------------------------------------------------------------
export interface QuoteResult {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  spark: number[];
  lastTradeTime?: number;
  marketState?: string;
}

// ---------------------------------------------------------------------------
// Market hours — determine whether US equity markets are currently open
// ---------------------------------------------------------------------------
export type MarketSession = 'open' | 'closed' | 'pre' | 'post';

export interface MarketStatus {
  session: MarketSession;
  isOpen: boolean;
  label: string;
  nextChange: string;
}

const MARKET_HOLIDAYS_2026 = [
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];

function isHoliday(date: Date): boolean {
  const ymd = date.toISOString().slice(0, 10);
  return MARKET_HOLIDAYS_2026.includes(ymd);
}

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function formatTimeUntil(target: Date, now: Date): string {
  const diffMs = target.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const hours = Math.floor(diffMs / 3600000);
  const minutes = Math.floor((diffMs % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  // US market hours: 9:30 AM – 4:00 PM Eastern, Mon–Fri
  // Pre-market: 4:00 AM – 9:30 AM; After-hours: 4:00 PM – 8:00 PM
  const utcDay = now.getUTCDay();
  if (utcDay === 0 || utcDay === 6) {
    return { session: 'closed', isOpen: false, label: 'Market Closed', nextChange: 'Opens Monday 9:30 AM ET' };
  }
  if (isHoliday(now)) {
    return { session: 'closed', isOpen: false, label: 'Market Closed — Holiday', nextChange: 'Opens next session' };
  }

  // Convert to ET (UTC-5 standard, UTC-4 daylight). We approximate with UTC-4
  // since DST is active Mar–Nov and the fixed offset is close enough for UI.
  const etOffset = isDST(now) ? -4 : -5;
  const etHour = (now.getUTCHours() + etOffset + 24) % 24;
  const etMinute = now.getUTCMinutes();
  const etTime = etHour + etMinute / 60;

  const preStart = 4;
  const openTime = 9.5;
  const closeTime = 16;
  const postEnd = 20;

  if (etTime >= openTime && etTime < closeTime) {
    const close = new Date(now);
    close.setUTCHours(closeTime - etOffset, 0, 0, 0);
    return { session: 'open', isOpen: true, label: 'Market Open', nextChange: `Closes in ${formatTimeUntil(close, now)}` };
  }
  if (etTime >= preStart && etTime < openTime) {
    const open = new Date(now);
    open.setUTCHours(9, 30 - etOffset, 0, 0);
    return { session: 'pre', isOpen: false, label: 'Pre-Market', nextChange: `Opens in ${formatTimeUntil(open, now)}` };
  }
  if (etTime >= closeTime && etTime < postEnd) {
    const end = new Date(now);
    end.setUTCHours(postEnd - etOffset, 0, 0, 0);
    return { session: 'post', isOpen: false, label: 'After Hours', nextChange: `Ends in ${formatTimeUntil(end, now)}` };
  }
  return { session: 'closed', isOpen: false, label: 'Market Closed', nextChange: 'Opens 9:30 AM ET' };
}

function isDST(date: Date): boolean {
  // Simple DST check: DST is active from second Sunday in March to first Sunday in November
  const month = date.getUTCMonth();
  if (month < 2 || month > 10) return false;
  if (month > 2 && month < 10) return true;
  const year = date.getUTCFullYear();
  if (month === 2) {
    const secondSunday = 8 + ((1 - new Date(Date.UTC(year, 2, 1)).getUTCDay() + 7) % 7);
    return date.getUTCDate() >= secondSunday;
  }
  const firstSunday = 1 + ((1 - new Date(Date.UTC(year, 10, 1)).getUTCDay() + 7) % 7);
  return date.getUTCDate() < firstSunday;
}

export async function fetchYahooQuotes(symbols: string[]): Promise<Record<string, QuoteResult>> {
  if (symbols.length === 0) return {};
  try {
    const res = await fetch(
      `${FUNCTION_URL}?action=quote&symbol=${encodeURIComponent(symbols.join(','))}`,
      { headers: HEADERS },
    );
    if (!res.ok) return {};
    const json = await res.json();
    const data = json.data as {
      quoteResponse?: {
        result?: Array<{
          symbol: string;
          regularMarketPrice?: number;
          regularMarketChange?: number;
          regularMarketChangePercent?: number;
          regularMarketTime?: number;
          marketState?: string;
        }>;
      };
    };
    const results = data.quoteResponse?.result;
    if (!results) return {};
    const map: Record<string, QuoteResult> = {};
    for (const q of results) {
      if (!q.symbol || q.regularMarketPrice == null) continue;
      map[q.symbol] = {
        symbol: q.symbol,
        price: q.regularMarketPrice,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        spark: [],
        lastTradeTime: q.regularMarketTime,
        marketState: q.marketState,
      };
    }
    return map;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Fetch a pair of price series, aligned by date. Returns null if either fails.
// ---------------------------------------------------------------------------
export interface PairPriceData {
  assetA: AssetInfo;
  assetB: AssetInfo;
  prices: { t: number; date: string; priceA: number; priceB: number }[];
}

export async function fetchPairPrices(
  assetA: AssetInfo,
  assetB: AssetInfo,
  days: number,
  interval: '1D' | '1W' | '4H' | '1H',
): Promise<PairPriceData | null> {
  const range = mapRange(days);
  const yInterval = mapInterval(interval);
  const [a, b] = await Promise.all([
    fetchYahooChart(assetA.ticker, range, yInterval),
    fetchYahooChart(assetB.ticker, range, yInterval),
  ]);
  if (!a || !b) return null;
  // align by date
  const mapB = new Map<string, number>();
  for (const p of b) mapB.set(p.date, p.price);
  const aligned: PairPriceData['prices'] = [];
  for (const pa of a) {
    const pb = mapB.get(pa.date);
    if (pb != null) {
      aligned.push({ t: pa.t, date: pa.date, priceA: pa.price, priceB: pb });
    }
  }
  if (aligned.length < 30) return null;
  return { assetA, assetB, prices: aligned };
}
