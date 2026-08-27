"use client";

import type { ReactNode } from "react";

/**
 * Chart primitives, drawn with inline SVG and CSS — no library.
 *
 * Two rules run through all of them. Colour never carries meaning alone:
 * every series has a legend or an axis label with the number on it. And the
 * palette is semantic where the data is semantic (status, health) and
 * categorical only where it genuinely has no order (owners).
 */

export interface Slice {
  key: string;
  label: string;
  value: number;
  /** CSS colour. Semantic tokens where the data has meaning. */
  color: string;
}

const TAU = Math.PI * 2;

/**
 * Donut rather than pie: the hole carries the total, which is the number
 * people actually want and would otherwise have to add up themselves.
 */
export function DonutChart({
  slices,
  size = 190,
  thickness = 30,
  totalLabel = "total",
  selectedKey,
  onSelect,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  totalLabel?: string;
  selectedKey?: string;
  onSelect?: (slice: Slice) => void;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;

  const visible = slices.filter((slice) => slice.value > 0);
  // Cumulative offsets computed up front so nothing is mutated during render.
  const arcs = visible.map((slice, index) => {
    const before = visible
      .slice(0, index)
      .reduce((sum, earlier) => sum + earlier.value, 0);
    const start = -Math.PI / 2 + (total > 0 ? (before / total) * TAU : 0);
    const sweep = total > 0 ? (slice.value / total) * TAU : 0;
    const end = start + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    // A full circle cannot be expressed as a single arc.
    const path =
      sweep >= TAU - 0.0001
        ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r}`
        : `M ${cx + r * Math.cos(start)} ${cy + r * Math.sin(start)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(end)} ${cy + r * Math.sin(end)}`;
    return { slice, path };
  });

  return (
    <div className="donut">
      <div className="donut-figure" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          role={onSelect ? "group" : "img"}
          aria-label={slices.map((s) => `${s.label}: ${s.value}`).join(", ")}
        >
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            strokeWidth={thickness}
            className="donut-track"
          />
          {arcs.map(({ slice, path }) => (
            <path
              aria-label={
                onSelect
                  ? `Filter by ${slice.label}: ${slice.value}`
                  : undefined
              }
              aria-pressed={onSelect ? selectedKey === slice.key : undefined}
              className={
                onSelect
                  ? `donut-path is-interactive${selectedKey === slice.key ? " is-selected" : ""}`
                  : "donut-path"
              }
              key={slice.key}
              d={path}
              fill="none"
              onClick={onSelect ? () => onSelect(slice) : undefined}
              onKeyDown={
                onSelect
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(slice);
                      }
                    }
                  : undefined
              }
              role={onSelect ? "button" : undefined}
              stroke={slice.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              tabIndex={onSelect ? 0 : undefined}
            />
          ))}
        </svg>
        <div className="donut-centre">
          <strong>{total}</strong>
          <span>{totalLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.key}>
            {onSelect ? (
              <button
                className={selectedKey === slice.key ? "is-selected" : ""}
                type="button"
                aria-pressed={selectedKey === slice.key}
                onClick={() => onSelect(slice)}
              >
                <i style={{ background: slice.color }} aria-hidden="true" />
                <span>{slice.label}</span>
                <b>{slice.value}</b>
                <small>
                  {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
                </small>
              </button>
            ) : (
              <>
                <i style={{ background: slice.color }} aria-hidden="true" />
                <span>{slice.label}</span>
                <b>{slice.value}</b>
                <small>
                  {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
                </small>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  color?: string;
  /** Optional avatar or monogram shown under the axis. */
  badge?: ReactNode;
}

/**
 * Vertical bars with the value printed above each one, so the chart is
 * readable without measuring against the axis.
 */
export function BarChart({
  bars,
  height = 190,
  accent = "var(--fh-primary)",
  emptyNote = "Nothing to show yet.",
  selectedKey,
  onSelect,
}: {
  bars: Bar[];
  height?: number;
  accent?: string;
  emptyNote?: string;
  selectedKey?: string;
  onSelect?: (bar: Bar) => void;
}) {
  if (!bars.length) return <p className="chart-empty">{emptyNote}</p>;
  const max = Math.max(...bars.map((bar) => bar.value), 1);
  // These axes count things, so every gridline must land on a whole number.
  // Pick the smallest "nice" step that keeps the axis to five ticks or fewer.
  const step =
    [1, 2, 5, 10, 20, 25, 50, 100, 250, 500, 1000].find(
      (candidate) => Math.ceil(max / candidate) <= 5,
    ) ?? Math.ceil(max / 5);
  const ticks = Math.max(1, Math.ceil(max / step));
  const ceiling = ticks * step;

  return (
    <div
      className="bar-chart"
      style={{ "--chart-h": `${height}px` } as React.CSSProperties}
    >
      <div className="bar-axis" aria-hidden="true">
        {Array.from({ length: ticks + 1 }, (_, index) => (
          <span key={index}>{(ticks - index) * step}</span>
        ))}
      </div>
      <div className="bar-plot">
        <div className="bar-grid" aria-hidden="true">
          {Array.from({ length: ticks + 1 }, (_, index) => (
            <i key={index} />
          ))}
        </div>
        <ul className="bar-list">
          {bars.map((bar) => (
            <li
              className={
                onSelect
                  ? `is-interactive${selectedKey === bar.key ? " is-selected" : ""}`
                  : undefined
              }
              key={bar.key}
            >
              {onSelect && (
                <button
                  className="bar-hit"
                  type="button"
                  aria-label={`Filter by ${bar.label}: ${bar.value}`}
                  aria-pressed={selectedKey === bar.key}
                  onClick={() => onSelect(bar)}
                />
              )}
              <b>{bar.value}</b>
              <span
                className="bar-fill"
                style={{
                  height: `${(bar.value / ceiling) * 100}%`,
                  background: bar.color ?? accent,
                }}
                role="img"
                aria-label={`${bar.label}: ${bar.value}`}
              />
              <span className="bar-label">
                {bar.badge}
                <small>{bar.label}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * A single stacked bar for a distribution — used in board group footers,
 * where the column is too narrow for a chart but the mix still matters.
 */
export function DistributionBar({
  slices,
  title,
}: {
  slices: Slice[];
  title?: string;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return <span className="dist-empty">—</span>;
  return (
    <span
      className="dist-bar"
      role="img"
      aria-label={
        title ?? slices.map((s) => `${s.label}: ${s.value}`).join(", ")
      }
      title={slices
        .filter((s) => s.value > 0)
        .map((s) => `${s.label}: ${s.value}`)
        .join(" · ")}
    >
      {slices
        .filter((slice) => slice.value > 0)
        .map((slice) => (
          <i
            key={slice.key}
            style={{
              width: `${(slice.value / total) * 100}%`,
              background: slice.color,
            }}
          />
        ))}
    </span>
  );
}
