import React, { useMemo, useState } from 'react';
import type { TemperatureReading, WardSettings } from '../types';
import { formatClockThai, formatShortTime } from '../utils/wardHelpers';

interface TemperatureChartProps {
  history: TemperatureReading[];
  settings: WardSettings;
}

export const TemperatureChart: React.FC<TemperatureChartProps> = ({ history, settings }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const width = 640;
  const height = 220;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 18;
  const padBottom = 30;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;

  const { minTemp, maxTemp, points } = useMemo(() => {
    const temps = history.map((h) => h.temperature);
    const minVal = Math.min(35.5, ...temps, settings.watchThreshold - 1);
    const maxVal = Math.max(39.8, ...temps, settings.feverThreshold + 0.8);
    const minT = Math.floor(minVal * 2) / 2;
    const maxT = Math.ceil(maxVal * 2) / 2;
    const span = Math.max(1, maxT - minT);

    const pts = history.map((item, idx) => {
      const x =
        history.length <= 1
          ? padLeft + innerW / 2
          : padLeft + (idx / (history.length - 1)) * innerW;
      const y = padTop + ((maxT - item.temperature) / span) * innerH;
      return { x, y, item };
    });

    return { minTemp: minT, maxTemp: maxT, points: pts };
  }, [history, settings.feverThreshold, settings.watchThreshold, innerW, innerH]);

  if (history.length === 0) {
    return (
      <div className="h-[220px] flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
        ยังไม่มีข้อมูลกราฟอุณหภูมิจากอุปกรณ์
      </div>
    );
  }

  const span = Math.max(1, maxTemp - minTemp);
  const yForTemp = (t: number) => padTop + ((maxTemp - t) / span) * innerH;

  const polylinePoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    points.length > 0
      ? `M ${points[0].x.toFixed(1)} ${padTop + innerH} ` +
        points.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') +
        ` L ${points[points.length - 1].x.toFixed(1)} ${padTop + innerH} Z`
      : '';

  const yTicks: number[] = [];
  for (let t = minTemp; t <= maxTemp + 0.01; t += 0.5) {
    if (Math.round(t * 10) % 10 === 0 || maxTemp - minTemp <= 3) {
      yTicks.push(Math.round(t * 10) / 10);
    }
  }

  const activePoint = hoverIdx !== null && points[hoverIdx] ? points[hoverIdx] : points[points.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let closest = 0;
    let minDist = Infinity;
    points.forEach((p, idx) => {
      const dist = Math.abs(p.x - relX);
      if (dist < minDist) {
        minDist = dist;
        closest = idx;
      }
    });
    setHoverIdx(closest);
  };

  const watchY = yForTemp(settings.watchThreshold);
  const feverY = yForTemp(settings.feverThreshold);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs text-slate-600">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 inline-block" />
            เฝ้าระวัง {settings.watchThreshold.toFixed(1)}°C
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-rose-500 inline-block" />
            ไข้สูง {settings.feverThreshold.toFixed(1)}°C
          </span>
        </div>
        {activePoint && (
          <div className="font-mono-tabular text-xs bg-slate-100 px-2.5 py-1 rounded-md text-slate-700">
            {formatClockThai(activePoint.item.timestamp)} ·{' '}
            <span
              className={
                activePoint.item.temperature >= settings.feverThreshold
                  ? 'font-bold text-rose-600'
                  : activePoint.item.temperature >= settings.watchThreshold
                    ? 'font-bold text-amber-600'
                    : 'font-bold text-emerald-600'
              }
            >
              {activePoint.item.temperature.toFixed(1)}°C
            </span>
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none cursor-crosshair overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="tempAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid */}
        {yTicks.map((tick) => {
          const y = yForTemp(tick);
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                y1={y}
                x2={width - padRight}
                y2={y}
                stroke="#e2e8f0"
                strokeWidth="1"
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-400 text-[10px] font-mono-tabular"
              >
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Watch Threshold Line */}
        {watchY >= padTop && watchY <= padTop + innerH && (
          <line
            x1={padLeft}
            y1={watchY}
            x2={width - padRight}
            y2={watchY}
            stroke="#f59e0b"
            strokeWidth="1.25"
            strokeDasharray="4 4"
          />
        )}

        {/* Fever Threshold Line */}
        {feverY >= padTop && feverY <= padTop + innerH && (
          <line
            x1={padLeft}
            y1={feverY}
            x2={width - padRight}
            y2={feverY}
            stroke="#f43f5e"
            strokeWidth="1.25"
            strokeDasharray="4 4"
          />
        )}

        {/* Area & Line */}
        {areaPath && <path d={areaPath} fill="url(#tempAreaGrad)" />}
        <polyline
          fill="none"
          stroke="#0d9488"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={polylinePoints}
        />

        {/* Hover Crosshair */}
        {activePoint && (
          <line
            x1={activePoint.x}
            y1={padTop}
            x2={activePoint.x}
            y2={padTop + innerH}
            stroke="#94a3b8"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
        )}

        {/* Data Points */}
        {points.map((p, idx) => {
          const isHot = p.item.temperature >= settings.feverThreshold;
          const isWatch = !isHot && p.item.temperature >= settings.watchThreshold;
          const isActive = activePoint?.item.timestamp === p.item.timestamp;
          const fill = isHot ? '#e11d48' : isWatch ? '#d97706' : '#0d9488';
          return (
            <circle
              key={`${p.item.timestamp}-${idx}`}
              cx={p.x}
              cy={p.y}
              r={isActive ? 5 : 2.8}
              fill={fill}
              stroke="#ffffff"
              strokeWidth={isActive ? 2 : 1}
            />
          );
        })}

        {/* X Axis Labels (First, Mid, Last) */}
        {points.length >= 2 && (
          <>
            <text
              x={points[0].x}
              y={height - 8}
              textAnchor="start"
              className="fill-slate-400 text-[10px] font-mono-tabular"
            >
              {formatShortTime(points[0].item.timestamp)}
            </text>
            <text
              x={points[Math.floor(points.length / 2)].x}
              y={height - 8}
              textAnchor="middle"
              className="fill-slate-400 text-[10px] font-mono-tabular"
            >
              {formatShortTime(points[Math.floor(points.length / 2)].item.timestamp)}
            </text>
            <text
              x={points[points.length - 1].x}
              y={height - 8}
              textAnchor="end"
              className="fill-slate-400 text-[10px] font-mono-tabular"
            >
              {formatShortTime(points[points.length - 1].item.timestamp)}
            </text>
          </>
        )}
      </svg>
    </div>
  );
};
