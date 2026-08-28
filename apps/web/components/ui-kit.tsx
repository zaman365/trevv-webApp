"use client";

import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Hint } from "./learning-center";

/**
 * The shared vocabulary for Portfolio and Workspace.
 *
 * Each page is built from the same four primitives — hero, stat strip, panel,
 * entity tile — so moving between them feels like moving inside one product
 * rather than between three. Each page then adds only the sections that are
 * specific to its altitude.
 */

/* ---------------------------------------------------------------- hero --- */

export function PageHero({
  eyebrow,
  title,
  subtitle,
  accent,
  monogram,
  selector,
  actions,
  stats,
  badge,
  hintId,
  children,
}: {
  eyebrow?: ReactNode;
  title: string;
  subtitle?: string;
  /** Status chip shown next to the title. */
  badge?: ReactNode;
  /** Opens the matching managed Learning Center resource. */
  hintId?: string;
  /** Brand colour, when the page is about one specific thing. */
  accent?: string;
  monogram?: string;
  selector?: ReactNode;
  actions?: ReactNode;
  stats?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      className={`page-hero ${accent ? "has-brand" : ""}`}
      style={
        accent ? ({ "--brand": accent } as React.CSSProperties) : undefined
      }
    >
      <div className="hero-top">
        {monogram && (
          <span className="hero-mark" aria-hidden="true">
            {monogram}
          </span>
        )}
        <div className="hero-copy">
          {eyebrow && <p className="hero-eyebrow">{eyebrow}</p>}
          <div className="hero-title-row">
            <h1>{title}</h1>
            {hintId && <Hint resourceId={hintId} />}
            {badge}
          </div>
          {subtitle && <p className="hero-sub">{subtitle}</p>}
        </div>
        {(selector || actions) && (
          <div className="hero-actions">
            {selector}
            {actions}
          </div>
        )}
      </div>
      {stats && <div className="hero-stats">{stats}</div>}
      {children}
    </section>
  );
}

/* ----------------------------------------------------------- stat tile --- */

export type StatTone = "neutral" | "primary" | "danger" | "warning" | "success";

export function StatTile({
  icon: Icon,
  value,
  label,
  note,
  tone = "neutral",
  href,
  onClick,
  active = false,
  meter,
  hintId,
}: {
  icon?: LucideIcon;
  value: ReactNode;
  label: string;
  note?: string;
  tone?: StatTone;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  /** 0–100. Draws a thin fill under the tile. */
  meter?: number | null;
  hintId?: string;
}) {
  const inner = (
    <>
      {Icon && (
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      )}
      <span className="stat-body">
        <strong>{value}</strong>
        <b className="stat-label-with-hint">
          {label}
          {hintId && !onClick && <Hint resourceId={hintId} />}
        </b>
        {note && <small>{note}</small>}
      </span>
      {(href || onClick) && (
        <span className="stat-arrow" aria-hidden="true">
          <ArrowRight size={15} />
        </span>
      )}
      {typeof meter === "number" && (
        <span className="stat-meter" aria-hidden="true">
          <i style={{ width: `${Math.max(0, Math.min(100, meter))}%` }} />
        </span>
      )}
    </>
  );
  const className = `stat-tile tone-${tone}${href || onClick ? " is-actionable" : ""}${active ? " is-active" : ""}`;
  return href ? (
    <Link className={className} href={href}>
      {inner}
    </Link>
  ) : onClick ? (
    <button
      className={className}
      type="button"
      aria-pressed={active}
      onClick={onClick}
    >
      {inner}
    </button>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/* --------------------------------------------------------------- panel --- */

export function Panel({
  icon: Icon,
  title,
  subtitle,
  href,
  linkLabel = "View all",
  aside,
  children,
  wide,
  hintId,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  href?: string;
  linkLabel?: string;
  aside?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  hintId?: string;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section
      className={`ui-panel ${wide ? "is-wide" : ""}`}
      aria-labelledby={id}
    >
      <header className="ui-panel-head">
        {Icon && (
          <span className="ui-panel-icon">
            <Icon size={17} />
          </span>
        )}
        <div>
          <h2 id={id} className="panel-title-with-hint">
            {title}
            {hintId && <Hint resourceId={hintId} />}
          </h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {aside}
        {href && (
          <Link className="ui-panel-link" href={href}>
            {linkLabel}
            <ArrowRight size={14} />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/* --------------------------------------------------------------- charts -- */

/**
 * A progress ring. Small enough to sit on a card, legible enough to read at
 * a glance — the number stays in the middle so it never depends on colour.
 */
export function ProgressRing({
  value,
  size = 46,
  accent,
  label,
}: {
  value: number;
  size?: number;
  accent?: string;
  label?: string;
}) {
  const stroke = size >= 60 ? 6 : 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="progress-ring"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label ?? "Progress"}: ${pct}%`}
    >
      <svg width={size} height={size} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="ring-track"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={accent ?? "var(--fh-primary)"}
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <b>{pct}</b>
    </span>
  );
}

export interface HealthSlice {
  key: string;
  label: string;
  count: number;
}

/**
 * Health mix as a single stacked bar. One row of colour answers "how is the
 * portfolio doing" faster than four separate counters, and the legend below
 * carries the numbers so colour is never the only signal.
 */
export function HealthBar({ slices }: { slices: HealthSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0) || 1;
  return (
    <div className="health-bar">
      <div
        className="health-track"
        role="img"
        aria-label={slices.map((s) => `${s.count} ${s.label}`).join(", ")}
      >
        {slices
          .filter((slice) => slice.count > 0)
          .map((slice) => (
            <span
              key={slice.key}
              className={`health-seg seg-${slice.key}`}
              style={{ width: `${(slice.count / total) * 100}%` }}
            />
          ))}
      </div>
      <ul className="health-legend">
        {slices.map((slice) => (
          <li key={slice.key} className={slice.count ? "" : "is-zero"}>
            <i className={`seg-${slice.key}`} aria-hidden="true" />
            <b>{slice.count}</b>
            {slice.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A compact horizontal bar for one labelled quantity. */
export function MeterRow({
  label,
  value,
  max,
  accent,
  caption,
}: {
  label: string;
  value: number;
  max: number;
  accent?: string;
  caption?: string;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="meter-row">
      <span className="meter-label">{label}</span>
      <span className="meter-track">
        <i
          style={{
            width: `${pct}%`,
            background: accent ?? "var(--fh-primary)",
          }}
        />
      </span>
      <span className="meter-value">{caption ?? value}</span>
    </div>
  );
}
