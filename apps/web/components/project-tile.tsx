"use client";

import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  CircleDashed,
  MoreHorizontal,
} from "lucide-react";
import {
  boardForWorkspace,
  type Workspace,
  type WorkspaceHealth,
  type WorkspaceRollup,
  type WorkItem,
} from "@founderhq/core";
import { getMessages } from "@founderhq/i18n";
import Link from "next/link";
import { ProgressRing } from "./ui-kit";
import { labelForType } from "@/lib/terminology";
import { workspaceHref } from "@/lib/workspace-routes";
import { useState } from "react";

const healthIcon: Record<WorkspaceHealth, typeof CheckCircle2> = {
  on_track: CheckCircle2,
  watch: CircleDashed,
  critical: AlertTriangle,
  parked: Archive,
};

export interface ProjectTileData {
  workspace: Workspace;
  rollup: WorkspaceRollup;
  blocker?: WorkItem | undefined;
  progress: number | null;
}

/**
 * The card that appears wherever a responsibility is listed — Portfolio,
 * search. The brand colour and monogram carry recognition, so a reader picks
 * their thing out of a grid by colour before they read a word.
 *
 * Four bands: identity, situation, what is committed, and the evidence.
 */
export function ProjectTile({
  workspace,
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
  const [menuOpen, setMenuOpen] = useState(false);
  const HealthIcon = healthIcon[workspace.health];
  const board = boardForWorkspace(workspace.id);
  const staleDays = Math.floor(
    (new Date("2026-08-24").getTime() -
      new Date(workspace.latestUpdate.date).getTime()) /
      86_400_000,
  );
  const showBlocker = Boolean(blocker) && workspace.health !== "on_track";
  const attention = rollup.decisions + rollup.approvals;

  return (
    <div
      className={`project-tile health-${workspace.health} ${compact ? "is-compact" : ""}`}
      style={{ "--brand": workspace.accent } as React.CSSProperties}
    >
      <div className="tile-brand" aria-hidden="true" />

      <div className="tile-head">
        <span className="tile-mark" aria-hidden="true">
          {workspace.icon}
        </span>
        <div className="tile-title">
          <h3>
            <Link className="tile-link" href={workspaceHref(workspace.slug)}>
              {workspace.name}
            </Link>
          </h3>
          <div className="tile-meta">
            <span className="tile-type">{labelForType(workspace.type)}</span>
            <span className="tile-dot" aria-hidden="true" />
            <span>{copy.stage[workspace.stage]}</span>
          </div>
        </div>
        {progress !== null && (
          <ProgressRing
            value={progress}
            accent={workspace.accent}
            label={`${workspace.name} progress`}
          />
        )}
        {!compact && (
          <div className="tile-action-wrap">
            <button
              aria-expanded={menuOpen}
              className="tile-more"
              aria-label={`Actions for ${workspace.name}`}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen && (
              <div className="tile-action-menu" role="menu">
                <Link href={workspaceHref(workspace.slug)} role="menuitem">
                  Open workspace
                </Link>
                {board && (
                  <Link
                    href={`${workspaceHref(workspace.slug)}/boards/${board.id}`}
                    role="menuitem"
                  >
                    Open board
                  </Link>
                )}
                <Link
                  href={workspaceHref(workspace.slug, "attention")}
                  role="menuitem"
                >
                  Review Workspace Attention
                </Link>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tile-status">
        <span className={`health-badge ${workspace.health}`}>
          <HealthIcon size={13} aria-hidden="true" />
          {copy.health[workspace.health]}
        </span>
        <p>{workspace.healthNote}</p>
      </div>

      {!compact && (
        <>
          <div className="tile-commitments">
            <div className={`tile-commit ${showBlocker ? "is-blocker" : ""}`}>
              <span className="ui-label">
                {showBlocker ? "Main blocker" : copy.common.priority}
              </span>
              <strong>
                {showBlocker ? blocker!.title : workspace.priority}
              </strong>
            </div>
            <div className="tile-commit">
              <span className="ui-label">{copy.common.milestone}</span>
              <strong>{workspace.nextMilestone.title}</strong>
              <time dateTime={workspace.nextMilestone.date}>
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                }).format(new Date(workspace.nextMilestone.date))}
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

          {showMetrics && workspace.metrics.length > 0 && (
            <div className="tile-metrics">
              {workspace.metrics.map((metric) => (
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
            <span
              className="avatar"
              style={{ background: workspace.lead.color }}
            >
              {workspace.lead.initials}
            </span>
            <div>
              <span className="ui-label">
                {copy.common.latestUpdate} ·{" "}
                {staleDays === 0
                  ? copy.common.today
                  : `${staleDays} ${staleDays === 1 ? copy.common.dayAgo : copy.common.daysAgo}`}
              </span>
              <p>{workspace.latestUpdate.text}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
