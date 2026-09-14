"use client";

import { ArrowUpRight, ArrowRight } from "lucide-react";
import { useState } from "react";
import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { formatLiveDateOnly } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import styles from "./planning-card.module.css";

export const planningKindLabels = {
  project: "Project",
  sprint: "Sprint",
  campaign: "Campaign",
  content: "Content calendar",
  backlog: "Backlog",
  operations: "Operations cycle",
  goals: "Company goals",
};

export function PlanningCard({
  board,
  workspaceSlug,
  timezone,
  teamName,
  parentName,
  items,
  complete,
  selected,
  onSelect,
  onEdit,
}: {
  board: BoardDto;
  workspaceSlug: string;
  timezone: string;
  teamName?: string | undefined;
  parentName?: string | undefined;
  items: WorkItemDto[];
  complete: boolean;
  selected?: boolean;
  onSelect?: () => void;
  onEdit?: (() => void) | undefined;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const kind = planningKindLabels[board.planning?.kind ?? "project"];
  const state = board.planning?.state ?? "planned";
  const href = `${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(board.id)}`;
  const done = items.filter((item) => item.status === "done").length;
  const blocked = items.filter((item) => item.status === "blocked").length;
  const milestones = items.filter((item) => item.type === "milestone");
  // Empty template labels remain in Details and the editor, but contribute no
  // useful summary on the card.
  const summary = board.description
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^(goal|scope|success criteria|milestones|risks):\s*$/i.test(line),
    )
    .join(" ");
  return (
    <article
      className={styles.card}
      data-selected={selected}
      data-testid={`planning-card-${board.id}`}
      aria-label={`${board.name} ${kind.toLowerCase()}`}
    >
      <header className={styles.top}>
        <span>{kind}</span>
        <span className={styles.badge} data-state={state}>
          {state}
        </span>
      </header>
      <h3>
        {onSelect ? (
          <button
            className={styles.primary}
            type="button"
            aria-pressed={selected}
            aria-controls="selected-sprint-work"
            title={board.name}
            onClick={onSelect}
          >
            {board.name}
          </button>
        ) : (
          <Link className={styles.primary} href={href} title={board.name}>
            {board.name}
          </Link>
        )}
      </h3>
      <p className={styles.summary}>
        {summary ||
          "Set a clear goal and success criteria in the plan details."}
      </p>
      <dl className={styles.meta}>
        <div>
          <dt>Team</dt>
          <dd title={teamName}>{teamName ?? "No team assigned"}</dd>
        </div>
        <div>
          <dt>Project</dt>
          <dd title={parentName ?? board.name}>
            {parentName ??
              ((board.planning?.kind ?? "project") === "project"
                ? board.name
                : "Standalone plan")}
          </dd>
        </div>
        <div>
          <dt>Start</dt>
          <dd>
            {board.startDate
              ? formatLiveDateOnly(board.startDate, timezone)
              : "Not scheduled"}
          </dd>
        </div>
        <div>
          <dt>Target</dt>
          <dd>
            {board.endDate
              ? formatLiveDateOnly(board.endDate, timezone)
              : "Not scheduled"}
          </dd>
        </div>
      </dl>
      <div className={styles.progress}>
        <div>
          <span>
            {complete
              ? `${done} / ${items.length} work items completed`
              : "Loading work…"}
          </span>
          <strong>
            {complete
              ? `${items.length ? Math.round((done / items.length) * 100) : 0}%`
              : "—"}
          </strong>
        </div>
        <progress
          aria-label={`${board.name} completion`}
          {...(complete ? { value: done } : {})}
          max={Math.max(1, items.length)}
        />
        <p className={styles.health} data-blocked={blocked > 0}>
          {complete
            ? `${items.length - done} open · ${blocked} blocked · ${milestones.length} ${milestones.length === 1 ? "milestone" : "milestones"}`
            : "Checking progress"}
        </p>
      </div>
      <footer className={styles.actions}>
        <span className={styles.openHint} aria-hidden="true">
          {onSelect ? "View work" : "Open board"} <ArrowRight size={14} />
        </span>
        <div>
          {onSelect ? (
            <Link href={href} aria-label={`Open ${board.name} board`}>
              <ArrowUpRight size={15} aria-hidden="true" /> Full page
            </Link>
          ) : null}
          {onEdit ? (
            <button type="button" onClick={onEdit}>
              Edit {kind.toLowerCase()}
            </button>
          ) : null}
        </div>
      </footer>
      {board.description ||
      milestones.length ||
      (state === "completed" && done < items.length) ? (
        <details
          className={styles.details}
          onToggle={(event) => setDetailsOpen(event.currentTarget.open)}
        >
          <summary>
            Details
            {milestones.length
              ? ` · ${milestones.length} ${milestones.length === 1 ? "milestone" : "milestones"}`
              : ""}
          </summary>
          {detailsOpen ? (
            <div>
              {board.description ? <p>{board.description}</p> : null}
              {state === "completed" && done < items.length ? (
                <p>
                  {items.length - done} unfinished items remain visible. Move
                  them to the next cycle from each task’s planning fields.
                </p>
              ) : null}
              {milestones.length ? (
                <ul aria-label={`${board.name} milestones`}>
                  {milestones.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`}
                      >
                        {item.title}
                      </Link>{" "}
                      ·{" "}
                      {item.status === "done"
                        ? "Completed"
                        : item.dueDate
                          ? formatLiveDateOnly(item.dueDate, timezone)
                          : "Set a due date"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </details>
      ) : (
        <span className={styles.detailsPlaceholder} />
      )}
    </article>
  );
}
