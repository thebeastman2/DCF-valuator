import { type StatResult } from '@/lib/stats';
import Tooltip from './Tooltip';
import CountUp from './CountUp';

const passBadge = {
  pass: { cls: 'badge-pass', label: 'PASS' },
  warn: { cls: 'badge-warn', label: 'WARN' },
  fail: { cls: 'badge-fail', label: 'FAIL' },
  neutral: { cls: 'badge-neutral', label: 'INFO' },
};

export default function StatCard({ stat }: { stat: StatResult }) {
  const badge = passBadge[stat.pass];
  return (
    <div className="glass glass-hover rounded-none p-4 flex flex-col gap-2 transition-all duration-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="panel-title">{stat.label}</span>
          <Tooltip content={stat.tooltip} />
        </div>
        <span className={`badge ${badge.cls}`}>{badge.label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-mono font-semibold text-white tabular-nums">
          {stat.display}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-white/[0.05] overflow-hidden">
          <div
            className="h-full transition-all duration-700 ease-out"
            style={{
              width: `${stat.confidence}%`,
              background:
                stat.pass === 'pass'
                  ? 'linear-gradient(90deg,#059669,#10b981)'
                  : stat.pass === 'warn'
                    ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                    : stat.pass === 'fail'
                      ? 'linear-gradient(90deg,#7f1d1d,#be123c)'
                      : 'linear-gradient(90deg,#334155,#64748b)',
            }}
          />
        </div>
        <span className="text-[10px] font-mono text-slate-soft/60 tabular-nums w-8 text-right">
          <CountUp value={stat.confidence} suffix="%" />
        </span>
      </div>
    </div>
  );
}
