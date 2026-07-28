import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, ReferenceLine, Area, ComposedChart, BarChart, Bar,
  Cell, Legend, AreaChart,
} from 'recharts';
import { type PairAnalysis } from '@/lib/stats';

const emerald = '#10b981';
const slate = '#94a3b8';
const white = '#e5e7eb';
const amber = '#f59e0b';
const crimson = '#be123c';

const gridStroke = 'rgba(255,255,255,0.04)';
const axisStyle = { fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fill: '#64748b' };

interface ChartProps {
  analysis: PairAnalysis;
  height?: number;
}

function ChartFrame({ title, subtitle, children, height = 220 }: { title: string; subtitle?: string; children: React.ReactNode; height?: number }) {
  return (
    <div className="glass rounded-none p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="panel-title">{title}</h4>
          {subtitle && <p className="text-[10px] text-slate-soft/50 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}

function dateTickFormatter(t: string, total: number) {
  if (!t) return '';
  const step = Math.max(1, Math.floor(total / 6));
  return t;
}

export function NormalizedPriceChart({ analysis, height = 240 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    [analysis.assetA.ticker]: analysis.normalizedA[i],
    [analysis.assetB.ticker]: analysis.normalizedB[i],
  }));
  return (
    <ChartFrame title="Normalized Prices" subtitle="Rebased to 100 at start of period" height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Line type="monotone" dataKey={analysis.assetA.ticker} stroke={emerald} strokeWidth={1.5} dot={false} animationDuration={900} />
          <Line type="monotone" dataKey={analysis.assetB.ticker} stroke={slate} strokeWidth={1.5} dot={false} animationDuration={900} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SpreadChart({ analysis, height = 200 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    spread: Number(analysis.spread[i].toFixed(3)),
    rolling: isNaN(analysis.rollingSpread[i]) ? null : Number(analysis.rollingSpread[i].toFixed(3)),
  }));
  return (
    <ChartFrame title="Spread" subtitle="A − β·B with 60-day rolling mean" height={height}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={45} />
          <RTooltip />
          <Line type="monotone" dataKey="spread" stroke={emerald} strokeWidth={1.2} dot={false} animationDuration={900} />
          <Line type="monotone" dataKey="rolling" stroke={white} strokeWidth={1} strokeDasharray="3 3" dot={false} animationDuration={900} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RollingCorrChart({ analysis, height = 180 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    corr: isNaN(analysis.rollingCorr[i]) ? null : Number(analysis.rollingCorr[i].toFixed(3)),
  }));
  return (
    <ChartFrame title="Rolling Correlation" subtitle="60-day window of log-return correlation" height={height}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="corrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={emerald} stopOpacity={0.3} />
              <stop offset="100%" stopColor={emerald} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis domain={[-1, 1]} tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Area type="monotone" dataKey="corr" stroke={emerald} strokeWidth={1.5} fill="url(#corrGrad)" animationDuration={900} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ZScoreChart({ analysis, height = 200 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    z: isNaN(analysis.zSeries[i]) ? null : Number(analysis.zSeries[i].toFixed(2)),
  }));
  return (
    <ChartFrame title="Z-Score" subtitle="Standardized spread with ±2 entry bands" height={height}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="zGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={emerald} stopOpacity={0.35} />
              <stop offset="50%" stopColor={emerald} stopOpacity={0.05} />
              <stop offset="100%" stopColor={crimson} stopOpacity={0.25} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <ReferenceLine y={2} stroke={amber} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={-2} stroke={amber} strokeDasharray="4 4" strokeOpacity={0.5} />
          <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
          <Area type="monotone" dataKey="z" stroke={emerald} strokeWidth={1.5} fill="url(#zGrad)" animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function ResidualsChart({ analysis, height = 180 }: ChartProps & { height?: number }) {
  const data = analysis.residuals.map((r, i) => ({
    idx: i,
    residual: Number(r.toFixed(3)),
  }));
  return (
    <ChartFrame title="Residuals" subtitle="OLS regression residuals" height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="idx" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Bar dataKey="residual" animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.residual >= 0 ? emerald : crimson} fillOpacity={0.6} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function RollingHedgeChart({ analysis, height = 180 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    hedge: isNaN(analysis.rollingHedge[i]) ? null : Number(analysis.rollingHedge[i].toFixed(3)),
  }));
  return (
    <ChartFrame title="Rolling Hedge Ratio" subtitle="60-day rolling OLS β" height={height}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Line type="monotone" dataKey="hedge" stroke={emerald} strokeWidth={1.5} dot={false} animationDuration={900} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function EquityCurveChart({ data, height = 220 }: { data: { date: string; equity: number; drawdown: number }[]; height?: number }) {
  return (
    <ChartFrame title="Equity Curve" subtitle="Strategy equity vs max drawdown" height={height}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={emerald} stopOpacity={0.3} />
              <stop offset="100%" stopColor={emerald} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={55} />
          <RTooltip />
          <Area type="monotone" dataKey="equity" stroke={emerald} strokeWidth={1.5} fill="url(#eqGrad)" animationDuration={900} />
          <Line type="monotone" dataKey="drawdown" stroke={crimson} strokeWidth={1} dot={false} animationDuration={900} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function DrawdownChart({ data, height = 160 }: { data: { date: string; drawdown: number }[]; height?: number }) {
  return (
    <ChartFrame title="Drawdown" subtitle="Peak-to-trough decline %" height={height}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={crimson} stopOpacity={0.05} />
              <stop offset="100%" stopColor={crimson} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={45} />
          <RTooltip />
          <Area type="monotone" dataKey="drawdown" stroke={crimson} strokeWidth={1.2} fill="url(#ddGrad)" animationDuration={900} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SignalTimelineChart({ analysis, height = 180 }: ChartProps & { height?: number }) {
  const data = analysis.prices.map((p, i) => ({
    date: p.date,
    z: isNaN(analysis.zSeries[i]) ? null : Number(analysis.zSeries[i].toFixed(2)),
    signal: isNaN(analysis.zSeries[i])
      ? 0
      : analysis.zSeries[i] > 1.5
        ? -1
        : analysis.zSeries[i] < -1.5
          ? 1
          : 0,
  }));
  return (
    <ChartFrame title="Signal Timeline" subtitle="Entry signals overlaid on Z-score" height={height}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <ReferenceLine y={1.5} stroke={amber} strokeDasharray="4 4" strokeOpacity={0.4} />
          <ReferenceLine y={-1.5} stroke={amber} strokeDasharray="4 4" strokeOpacity={0.4} />
          <Line type="monotone" dataKey="z" stroke={emerald} strokeWidth={1.2} dot={false} animationDuration={900} />
          <Bar dataKey="signal" fill={emerald} fillOpacity={0.5} animationDuration={500} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function MonteCarloFanChart({ data, height = 280 }: { data: any[]; height?: number }) {
  return (
    <ChartFrame title="Monte Carlo Fan Chart" subtitle="Confidence bands across simulation horizon" height={height}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="fanGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={emerald} stopOpacity={0.25} />
              <stop offset="100%" stopColor={emerald} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="date" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Area type="monotone" dataKey="p95" stroke="none" fill="none" animationDuration={600} />
          <Area type="monotone" dataKey="p75" stroke="none" fill="none" animationDuration={600} />
          <Area type="monotone" dataKey="p25" stroke="none" fill="none" animationDuration={600} />
          <Area type="monotone" dataKey="p5" stroke={emerald} strokeWidth={0.5} fill="none" animationDuration={600} />
          <Area type="monotone" dataKey="p95" stroke={emerald} strokeWidth={0.5} fill="url(#fanGrad)" animationDuration={600} />
          <Area type="monotone" dataKey="p50" stroke={white} strokeWidth={1.5} fill="none" animationDuration={600} />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function HistogramChart({ data, height = 200 }: { data: { bucket: number; count: number }[]; height?: number }) {
  return (
    <ChartFrame title="Return Distribution" subtitle="Histogram of simulated outcomes" height={height}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={gridStroke} vertical={false} />
          <XAxis dataKey="bucket" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={20} />
          <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} />
          <RTooltip />
          <Bar dataKey="count" fill={emerald} fillOpacity={0.5} animationDuration={700} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

export function SparklineChart({ data, height = 24, showAxis = false }: { data: number[]; height?: number; showAxis?: boolean }) {
  const chartData = data.map((v, i) => ({ idx: i, val: v }));
  const isUp = data.length > 1 && data[data.length - 1] >= data[0];
  const color = isUp ? '#10b981' : '#e11d48';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${isUp ? 'up' : 'down'}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis && <CartesianGrid stroke={gridStroke} vertical={false} />}
        {showAxis && <XAxis dataKey="idx" tick={axisStyle} tickLine={false} axisLine={false} minTickGap={60} />}
        {showAxis && <YAxis tick={axisStyle} tickLine={false} axisLine={false} width={40} domain={['auto', 'auto']} />}
        <Area type="monotone" dataKey="val" stroke={color} strokeWidth={showAxis ? 1.5 : 1} fill={`url(#spark-${isUp ? 'up' : 'down'})`} animationDuration={600} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
