import { useEffect, useRef, useState } from 'react';
import { diffDays, formatDDMM } from '../engine/dates';
import { fmtNum } from '../engine/format';

export interface Point {
  day: string;
  value: number;
}

/** Maps local calendar dates to pixels, preserving elapsed days across time zones and DST. */
export function createDayScale(days: readonly string[], left: number, width: number) {
  const sorted = [...days].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last || first === last) return () => left + width / 2;
  const span = diffDays(first, last);
  return (day: string) => left + (diffDays(first, day) / span) * width;
}

/** Real pixel width, so chart text stays 12px instead of scaling with the viewBox. */
function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Line chart in the Harbor chart style: main series in brand-500, comparison in a
 * dashed neutral, direct labels, minimal axis.
 */
export function LineChart({
  main,
  compare,
  mainLabel,
  compareLabel,
  unit,
  height = 180,
}: {
  main: Point[];
  compare?: Point[];
  mainLabel: string;
  compareLabel?: string;
  unit: string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  if (main.length === 0) return null;
  const pad = { top: 20, right: 76, bottom: 26, left: 8 };
  const all = [...main, ...(compare ?? [])];
  const values = all.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  min -= span * 0.15;
  max += span * 0.15;
  const days = [...new Set(all.map((p) => p.day))].sort();
  const plotW = Math.max(40, width - pad.left - pad.right);
  const x = createDayScale(days, pad.left, plotW);
  const y = (v: number) =>
    pad.top + (1 - (v - min) / (max - min)) * (height - pad.top - pad.bottom);
  const sorted = (pts: Point[]) => [...pts].sort((a, b) => a.day.localeCompare(b.day));
  const path = (pts: Point[]) =>
    sorted(pts)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join(' ');
  const lastMain = sorted(main)[main.length - 1] as Point;
  const lastCompare = compare?.length ? (sorted(compare)[compare.length - 1] as Point) : null;
  const seriesSummary = (label: string, points: Point[]) =>
    `${label}: ${sorted(points)
      .map((p) => `${formatDDMM(p.day)}, ${fmtNum(p.value)} ${unit}`)
      .join('; ')}`;
  const summary = [
    seriesSummary(mainLabel, main),
    ...(compare?.length ? [seriesSummary(compareLabel ?? 'Comparação', compare)] : []),
  ].join('. ');
  return (
    <div ref={ref} style={{ width: '100%' }}>
      <svg
        className="hb-chart"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={summary}
      >
        <line
          className="c-grid"
          x1={pad.left}
          x2={pad.left + plotW}
          y1={height - pad.bottom}
          y2={height - pad.bottom}
        />
        {compare && compare.length > 1 ? <path className="c-compare" d={path(compare)} /> : null}
        {main.length > 1 ? <path className="c-main" d={path(main)} /> : null}
        {main.map((p) => (
          <circle key={p.day} className="c-dot" cx={x(p.day)} cy={y(p.value)} r={4.5} />
        ))}
        <text className="c-label" x={x(lastMain.day) + 10} y={y(lastMain.value) + 4}>
          {fmtNum(lastMain.value)} {unit}
        </text>
        {lastCompare && compareLabel ? (
          <text
            x={x(lastCompare.day) + 10}
            y={Math.max(y(lastCompare.value) + 4, y(lastMain.value) + 20)}
          >
            {compareLabel}
          </text>
        ) : null}
        <text x={pad.left} y={height - 6}>
          {formatDDMM(days[0] as string)}
        </text>
        {days.length > 1 ? (
          <text x={pad.left + plotW} y={height - 6} textAnchor="end">
            {formatDDMM(days[days.length - 1] as string)}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

/** Horizontal bars (HTML) with direct labels and an optional neutral limit marker. */
export function BarList({
  rows,
  limit,
  limitLabel,
  unit,
}: {
  rows: { label: string; value: number; sub?: string }[];
  limit?: number;
  limitLabel?: string;
  unit: string;
}) {
  const max = Math.max(limit ?? 0, ...rows.map((r) => r.value), 1);
  return (
    <div className="stack-sm" role="list">
      {rows.map((r) => (
        <div
          key={r.label}
          role="listitem"
          style={{
            display: 'grid',
            gridTemplateColumns: '108px 1fr 64px',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span className="t-label" style={{ color: 'var(--ink)' }}>
            {r.label}
          </span>
          <span
            className="hb-meter"
            style={{ position: 'relative', overflow: 'visible' }}
            aria-hidden="true"
          >
            <span
              style={{
                width: `${(r.value / max) * 100}%`,
                display: 'block',
                height: '100%',
                borderRadius: 'inherit',
                background: 'var(--brand-500)',
              }}
            />
            {limit ? (
              <i
                style={{
                  position: 'absolute',
                  left: `${(limit / max) * 100}%`,
                  top: -4,
                  bottom: -4,
                  borderLeft: '1px dashed var(--ink-muted)',
                }}
              />
            ) : null}
          </span>
          <span className="t-regular t-num" style={{ textAlign: 'right' }}>
            {fmtNum(r.value)} {unit}
          </span>
        </div>
      ))}
      {limit && limitLabel ? <span className="t-caption">{limitLabel}</span> : null}
    </div>
  );
}
