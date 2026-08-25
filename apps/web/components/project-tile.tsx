"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDashed,
  MoreHorizontal,
} from "lucide-react";
import type { Hub, HubHealth, HubRollup, WorkItem } from "@founderhq/core";
import { getMessages } from "@founderhq/i18n";
import Link from "next/link";
import { ProgressRing } from "./ui-kit";
import { labelForType } from "@/lib/terminology";

const healthIcon: Record<HubHealth, typeof CheckCircle2> = {
  on_track: CheckCircle2,
  watch: CircleDashed,
  critical: AlertTriangle,
  parked: Archive,
};

export interface ProjectTileData {
  hub: Hub;
  rollup: HubRollup;
  blocker?: WorkItem | undefined;
  progress: number | null;
}

/**
 * The card that appears wherever a responsibility is listed — Home, Portfolio,
 * search. The brand colour and monogram carry recognition, so a reader picks
 * their thing out of a grid by colour before they read a word.
 *
 * Four bands: identity, situation, what is committed, and the evidence.
 */
export function ProjectTile({
  hub,
  rollup,
  blocker,
  progress,
  copy,
  showMetrics = true,
  compact = false,
}: ProjectTileData & {
  copy: ReturnType<typeof getMessages>;
  showMetrics?: boolean;
  compact?: boolean;
}) {
  const HealthIcon = healthIcon[hub.health];
  const staleDays = Math.floor(
    (new Date("2026-08-24").getTime() -
      new Date(hub.latestUpdate.date).getTime()) /
      86_400_000,
  );
  const showBlocker = Boolean(blocker) && hub.health !== "on_track";
  const attention = rollup.decisions + rollup.approvals;

  return (
    <div
      className={`project-tile health-${hub.health} ${compact ? "is-compact" : ""}`}
      style={{ "--brand": hub.accent } as React.CSSProperties}
    >
      <div className="tile-brand" aria-hidden="true" />

      <div className="tile-head">
        <span className="tile-mark" aria-hidden="true">
          {hub.icon}
        </span>
        <div className="tile-title">
          <h3>
            <Link className="tile-link" href={`/app/hubs/${hub.slug}`}>
              {hub.name}
            </Link>
          </h3>
          <div className="tile-meta">
            <span className="tile-type">{labelForType(hub.type)}</span>
            <span className="tile-dot" aria-hidden="true" />
            <span>{copy.stage[hub.stage]}</span>
          </div>
        </div>
        {progress !== null && (
          <ProgressRing
            value={progress}
            accent={hub.accent}
            label={`${hub.name} progress`}
          />
        )}
        {!compact && (
          <button className="tile-more" aria-label={`Actions for ${hub.name}`}>
            <MoreHorizontal size={18} />
          </button>
        )}
      </div>

      <div className="tile-status">
        <span className={`health-badge ${hub.health}`}>
          <HealthIcon size={13} aria-hidden="true" />
          {copy.health[hub.health]}
        </span>
        <p>{hub.healthNote}</p>
      </div>

      {!compact && (
        <>
          <div className="tile-commitments">
            <div className={`tile-commit ${showBlocker ? "is-blocker" : ""}`}>
              <span className="ui-label">
                {showBlocker ? "Main blocker" : copy.common.priority}
              </span>
              <strong>{showBlocker ? blocker!.title : hub.priority}</strong>
            </div>
            <div className="tile-commit">
              <span className="ui-label">{copy.common.milestone}</span>
              <strong>{hub.nextMilestone.title}</strong>
              <time dateTime={hub.nextMilestone.date}>
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(hub.nextMilestone.date))}
              </time>
            </div>
          </div>

          <div className="tile-stats">
            <span>
              <b>{rollup.open}</b>
              {copy.common.open}
            </span>
            <span className={rollup.overdue ? "stat-danger" : ""}>
              <b>{rollup.overdue}</b>
              {copy.common.overdue}
            </span>
            <span className={rollup.blocked ? "stat-danger" : ""}>
              <b>{rollup.blocked}</b>
              {copy.common.blocked}
            </span>
            <span className={attention ? "stat-attention" : ""}>
              <b>{attention}</b>
              {copy.common.attention}
            </span>
          </div>

          {showMetrics && hub.metrics.length > 0 && (
            <div className="tile-metrics">
              {hub.metrics.map((metric) => (
                <div key={metric.label}>
                  <span className="ui-label">{metric.label}</span>
                  <strong>{metric.value}</strong>
                  {metric.trend && (
                    <small
                      className={
                        metric.trend.trim().startsWith("-")
                          ? "is-down"
                          : "is-up"
                      }
                    >
                      {metric.trend}
                    </small>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="tile-update">
            <span className="avatar" style={{ background: hub.lead.color }}>
              {hub.lead.initials}
            </span>
            <div>
              <span className="ui-label">
                {copy.common.latestUpdate} ·{" "}
                {staleDays === 0
                  ? copy.common.today
                  : `${staleDays} ${staleDays === 1 ? copy.common.dayAgo : copy.common.daysAgo}`}
              </span>
              <p>{hub.latestUpdate.text}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
