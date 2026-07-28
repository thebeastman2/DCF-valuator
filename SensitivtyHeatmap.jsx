import React from 'react';
import { heatmapColor } from '@/lib/dcfEngine';
import EditableLabel from './EditableLabel';

export default function SensitivityHeatmap({ sensitivity, title, rowAxisLabel, colAxisLabel, formatCell, formatAxis, onEditRow, onEditCol, rowIsPercent = false, colIsPercent = false }) {
  const { rowLabels, colLabels, matrix } = sensitivity;
  const allValues = matrix.flat().filter(v => !isNaN(v) && isFinite(v));
  const min = allValues.length > 0 ? Math.min(...allValues) : 0;
  const max = allValues.length > 0 ? Math.max(...allValues) : 0;

  return (
    <div className="bg-[#131825] border border-slate-800/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span>Low</span>
          <div className="w-20 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(0,65%,40%), hsl(60,65%,40%), hsl(120,65%,40%))' }} />
          <span>High</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-slate-500 font-medium whitespace-nowrap">{rowAxisLabel} \ {colAxisLabel}</th>
              {colLabels.map((c, i) => {
                const center = colLabels[2];
                return (
                <th key={i} className="text-center px-2 py-1.5 text-slate-400 font-mono font-medium whitespace-nowrap">
                  {onEditCol ? (
                    <EditableLabel
                      value={c}
                      isPercent={colIsPercent}
                      onCommit={val => onEditCol(val - (c - center))}
                      title={`Edit ${colAxisLabel}`}
                      className="w-16 bg-slate-800/60 border border-emerald-500/30 rounded px-1 py-0.5 text-emerald-400 text-center focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  ) : formatAxis(c)}
                </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((w, i) => (
              <tr key={i}>
                <td className="text-right px-2 py-1 text-slate-400 font-mono font-medium whitespace-nowrap">
                  {onEditRow ? (
                    <EditableLabel
                      value={w}
                      isPercent={rowIsPercent}
                      onCommit={val => onEditRow(val - (w - rowLabels[2]))}
                      title={`Edit ${rowAxisLabel}`}
                      className="w-16 bg-slate-800/60 border border-emerald-500/30 rounded px-1 py-0.5 text-emerald-400 text-center focus:outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
                    />
                  ) : formatAxis(w)}
                </td>
                {colLabels.map((_, j) => {
                  const val = matrix[i][j];
                  const invalid = isNaN(val) || !isFinite(val);
                  return (
                    <td key={j} className="text-center px-1 py-1 relative hover:z-10">
                      <div
                        className="heatmap-cell rounded-md py-2.5 px-1 font-mono font-semibold text-white/90 cursor-default hover:scale-110 hover:shadow-lg"
                        style={invalid ? { backgroundColor: 'rgba(100, 116, 139, 0.12)', color: 'rgba(100, 116, 139, 0.5)' } : { backgroundColor: heatmapColor(val, min, max) }}
                      >
                        {invalid ? '—' : formatCell(val)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
