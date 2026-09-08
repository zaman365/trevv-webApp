"use client";

import { useMemo, useState, type CSSProperties } from "react";
import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Flag,
  FolderKanban,
  ListTodo,
  Users,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import {
  dashboardMetrics,
  dashboardStatuses,
  type DashboardFocus,
} from "@/lib/workspace-dashboard";
import { workspaceHref } from "@/lib/workspace-routes";
import { formatLiveDateOnly } from "@/lib/live-workflow-ui";
import styles from "./workspace-dashboard.module.css";

export function WorkspaceDashboardWidgets({
  items,
  boards,
  workspaceSlug,
  timezone,
  today,
  days,
  complete,
  plansLoaded,
  onFocus,
}: {
  items: WorkItemDto[];
  boards: BoardDto[];
  workspaceSlug: string;
  timezone: string;
  today: string;
  days: number;
  complete: boolean;
  plansLoaded: boolean;
  onFocus: (focus: DashboardFocus) => void;
}) {
  const metrics = useMemo(
    () => dashboardMetrics(items, today, days),
    [items, today, days],
  );
  const [allPeople, setAllPeople] = useState(false);
  const [allPlans, setAllPlans] = useState(false);
  const projectRows = useMemo(() => {
    const indexed = new Map<string, WorkItemDto[]>();
    for (const item of items)
      for (const id of new Set(
        [item.boardId, item.planning?.cycleId].filter(Boolean) as string[],
      )) {
        const group = indexed.get(id) ?? [];
        group.push(item);
        indexed.set(id, group);
      }
    return boards
      .map((board) => {
        const records = indexed.get(board.id) ?? [];
        const counts = new Map<string, number>();
        let overdue = 0;
        for (const item of records) {
          counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
          if (item.status !== "done" && item.dueDate && item.dueDate < today)
            overdue++;
        }
        const done = counts.get("done") ?? 0,
          blocked = counts.get("blocked") ?? 0;
        return {
          board,
          total: records.length,
          done,
          counts,
          overdue,
          blocked,
          health: !records.length
            ? "No work yet"
            : overdue || blocked
              ? "Needs attention"
              : !complete
                ? "Loaded work"
                : done === records.length
                  ? "Complete"
                  : "On track",
        };
      })
      .sort(
        (a, b) =>
          b.overdue + b.blocked - (a.overdue + a.blocked) ||
          a.board.name.localeCompare(b.board.name),
      );
  }, [boards, items, today, complete]);
  const maxDeadline = Math.max(1, ...metrics.deadlines.map((day) => day.count));
  const maxOwner = Math.max(1, ...metrics.owners.map((owner) => owner.open));
  let ringOffset = 0;
  const ring = metrics.statuses
    .map((status) => {
      const start = ringOffset;
      ringOffset += metrics.total ? (status.count / metrics.total) * 100 : 0;
      return `${status.color} ${start}% ${ringOffset}%`;
    })
    .join(",");
  const totals = [
    {
      label: "Open work",
      value: metrics.open,
      note: `${metrics.unassigned} need an owner`,
      icon: ListTodo,
      tone: "purple",
      focus: { kind: "open", label: "Open work" },
    },
    {
      label: "Overdue",
      value: metrics.overdue,
      note: "Past the due date",
      icon: CalendarDays,
      tone: "rose",
      focus: { kind: "overdue", label: "Overdue work" },
    },
    {
      label: "Blocked",
      value: metrics.blocked,
      note: "Needs help to move",
      icon: CircleAlert,
      tone: "amber",
      focus: { kind: "status", key: "blocked", label: "Blocked work" },
    },
    {
      label: "Completed",
      value: metrics.done,
      note: `${metrics.total} work items in scope`,
      icon: CheckCircle2,
      tone: "green",
      focus: { kind: "status", key: "done", label: "Completed work" },
    },
  ] satisfies Array<{
    label: string;
    value: number;
    note: string;
    icon: typeof ListTodo;
    tone: string;
    focus: DashboardFocus;
  }>;
  return (
    <div className={styles.widgets}>
      {!complete && (
        <p className={styles.dataNote} role="status">
          Charts show the work loaded so far. Totals and progress may change as
          more records arrive.
        </p>
      )}
      <section className={styles.kpis} aria-label="Workspace totals">
        {totals.map(({ label, value, note, icon: Icon, tone, focus }) => (
          <button
            type="button"
            key={label}
            className={styles.kpi}
            data-tone={tone}
            onClick={() => onFocus(focus)}
          >
            <span className={styles.kpiTop}>
              <span>{label}</span>
              <span className={styles.kpiIcon}>
                <Icon size={18} aria-hidden="true" />
              </span>
            </span>
            <strong>{value}</strong>
            <span className={styles.kpiFoot}>
              {note}
              <ArrowRight size={15} aria-hidden="true" />
            </span>
          </button>
        ))}
      </section>
      <div className={styles.chartGrid}>
        <section
          className={styles.widget}
          aria-labelledby="dashboard-status-title"
        >
          <header>
            <div>
              <p>Delivery at a glance</p>
              <h2 id="dashboard-status-title">Work by status</h2>
            </div>
            <span className={styles.badge}>{metrics.total} items</span>
          </header>
          <div className={styles.statusBody}>
            <div
              className={styles.ring}
              role="img"
              aria-label={`${metrics.done} of ${metrics.total} work items completed${complete ? "" : " among loaded records"}`}
              style={{
                background: metrics.total
                  ? `conic-gradient(${ring})`
                  : "var(--fh-border)",
              }}
            >
              <div>
                <strong>
                  {metrics.total ? `${metrics.completion}%` : "—"}
                </strong>
                <span>{metrics.total ? "completed" : "No work yet"}</span>
              </div>
            </div>
            <div className={styles.legend}>
              {metrics.statuses.map((status) => (
                <button
                  type="button"
                  key={status.key}
                  onClick={() =>
                    onFocus({
                      kind: "status",
                      key: status.key,
                      label: status.label,
                    })
                  }
                  aria-label={`Show ${status.label.toLowerCase()} work: ${status.count}`}
                >
                  <span
                    className={styles.dot}
                    style={{ background: status.color }}
                  />
                  <span>{status.label}</span>
                  <strong>{status.count}</strong>
                </button>
              ))}
            </div>
          </div>
          <button
            type="button"
            className={styles.textAction}
            onClick={() =>
              onFocus({ kind: "unassigned", label: "Work needing an owner" })
            }
          >
            {metrics.unassigned} open items need an owner{" "}
            <ArrowRight size={14} />
          </button>
        </section>
        <section
          className={styles.widget}
          aria-labelledby="dashboard-deadlines-title"
        >
          <header>
            <div>
              <p>Plan the days ahead</p>
              <h2 id="dashboard-deadlines-title">Upcoming deadlines</h2>
            </div>
            <span className={styles.badge}>Next {days} days</span>
          </header>
          <div
            className={styles.deadlineChart}
            role="img"
            data-dense={days > 14}
            style={{ "--day-count": days } as CSSProperties}
            aria-label={`Open work due over the next ${days} days. Use Work due on to inspect a date.`}
          >
            {metrics.deadlines.map((day, index) => (
              <div
                key={day.date}
                aria-hidden="true"
                title={`${formatLiveDateOnly(day.date, timezone)} · ${day.count} open items due`}
              >
                <span className={styles.barTrack}>
                  <span
                    className={styles.dayBar}
                    style={{ height: `${(day.count / maxDeadline) * 100}%` }}
                  >
                    {day.count > 0 && days <= 14 && <b>{day.count}</b>}
                  </span>
                </span>
                <span className={styles.dayLabel}>
                  {days <= 14 || index % 5 === 0 || index === days - 1
                    ? day.date.slice(8)
                    : ""}
                </span>
              </div>
            ))}
          </div>
          <label className={styles.deadlinePicker}>
            Work due on
            <select
              aria-label="Work due on"
              value=""
              onChange={(event) => {
                if (event.target.value)
                  onFocus({
                    kind: "date",
                    key: event.target.value,
                    label: `Due ${formatLiveDateOnly(event.target.value, timezone)}`,
                  });
              }}
            >
              <option value="">Choose a date to view tasks</option>
              {metrics.deadlines.map((day) => (
                <option key={day.date} value={day.date}>
                  {formatLiveDateOnly(day.date, timezone)} · {day.count} open
                </option>
              ))}
            </select>
          </label>
          <footer>
            <span>{metrics.undated} open items have no due date</span>
            <Link href={workspaceHref(workspaceSlug, "calendar")}>
              Open calendar <ArrowRight size={14} />
            </Link>
          </footer>
        </section>
        <section
          className={`${styles.widget} ${styles.projects}`}
          aria-labelledby="dashboard-projects-title"
          id="dashboard-plans"
        >
          <header>
            <div>
              <p>Projects and delivery cycles</p>
              <h2 id="dashboard-projects-title">Project progress</h2>
            </div>
            <Link href={workspaceHref(workspaceSlug, "planning")}>
              Plan work <ArrowRight size={14} />
            </Link>
          </header>
          {projectRows.length ? (
            <div className={styles.projectList}>
              {(allPlans ? projectRows : projectRows.slice(0, 6)).map((row) => (
                <Link
                  className={styles.project}
                  key={row.board.id}
                  data-testid={`board-link-${row.board.id}`}
                  href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(row.board.id)}`}
                >
                  <div className={styles.projectTitle}>
                    <span>
                      <FolderKanban size={17} />
                      <strong>{row.board.name}</strong>
                    </span>
                    <span
                      className={styles.health}
                      data-risk={Boolean(row.overdue || row.blocked)}
                    >
                      {row.health}
                    </span>
                  </div>
                  <div
                    className={styles.progressTrack}
                    role="img"
                    aria-label={`${row.done} of ${row.total} items completed`}
                  >
                    {dashboardStatuses.map((status) => (
                      <span
                        key={status.key}
                        style={{
                          background: status.color,
                          width: `${row.total ? ((row.counts.get(status.key) ?? 0) / row.total) * 100 : 0}%`,
                        }}
                      />
                    ))}
                  </div>
                  <div className={styles.projectMeta}>
                    <span>
                      {row.done}/{row.total} done ·{" "}
                      {row.board.planning?.kind?.replaceAll("_", " ") ??
                        "project"}{" "}
                      · {row.board.visibility}
                    </span>
                    <span>
                      {row.board.endDate
                        ? `Target ${formatLiveDateOnly(row.board.endDate, timezone)}`
                        : "No target date"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : !plansLoaded ? (
            <div className={styles.empty}>
              <FolderKanban size={28} />
              <strong>Project data is not available yet</strong>
              <p>
                Your project progress will appear when the project list finishes
                loading.
              </p>
            </div>
          ) : (
            <div className={styles.empty}>
              <FolderKanban size={28} />
              <strong>Your next project starts here</strong>
              <p>Create a plan, add tasks and track delivery in this space.</p>
              <Link href={workspaceHref(workspaceSlug, "planning")}>
                Create a project <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {projectRows.length > 6 && (
            <button
              className={styles.textAction}
              type="button"
              onClick={() => setAllPlans(!allPlans)}
            >
              {allPlans
                ? "Show fewer plans"
                : `Show all ${projectRows.length} plans`}
            </button>
          )}
        </section>
        <section
          className={styles.widget}
          aria-labelledby="dashboard-workload-title"
        >
          <header>
            <div>
              <p>Balance the work</p>
              <h2 id="dashboard-workload-title">Workload by person</h2>
            </div>
            <Users size={20} aria-hidden="true" />
          </header>
          {metrics.owners.length ? (
            <div className={styles.ownerList}>
              {(allPeople ? metrics.owners : metrics.owners.slice(0, 6)).map(
                (owner) => (
                  <button
                    type="button"
                    key={owner.id}
                    onClick={() =>
                      onFocus({
                        kind: "owner",
                        key: owner.id,
                        label: `Open work · ${owner.name}`,
                      })
                    }
                  >
                    <span className={styles.avatar}>
                      {owner.name
                        .split(" ")
                        .map((word) => word[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                    <span className={styles.ownerBody}>
                      <span>
                        <strong>{owner.name}</strong>
                        <b>{owner.open}</b>
                      </span>
                      <span className={styles.ownerTrack}>
                        <span
                          style={{ width: `${(owner.open / maxOwner) * 100}%` }}
                        >
                          <i
                            style={{
                              width: `${(owner.blocked / owner.open) * 100}%`,
                            }}
                          />
                        </span>
                      </span>
                      <small>
                        {owner.overdue} overdue · {owner.blocked} blocked
                      </small>
                    </span>
                  </button>
                ),
              )}
            </div>
          ) : (
            <div className={styles.empty}>
              <Users size={28} />
              <strong>No open assignments</strong>
              <p>Assign work to see who is handling what.</p>
            </div>
          )}
          {metrics.owners.length > 6 && (
            <button
              className={styles.textAction}
              type="button"
              onClick={() => setAllPeople(!allPeople)}
            >
              {allPeople
                ? "Show fewer people"
                : `Show all ${metrics.owners.length} people`}
            </button>
          )}
          <footer>
            <span>Open item counts · shared work counts for each assignee</span>
            <Link href={workspaceHref(workspaceSlug, "teams")}>
              Manage team <ArrowRight size={14} />
            </Link>
          </footer>
        </section>
        <section
          className={`${styles.widget} ${styles.milestones}`}
          aria-labelledby="dashboard-milestones-title"
        >
          <header>
            <div>
              <p>The next commitments</p>
              <h2 id="dashboard-milestones-title">Milestones</h2>
            </div>
            <Link href={workspaceHref(workspaceSlug, "planning")}>
              Projects & sprints <ArrowRight size={14} />
            </Link>
          </header>
          {metrics.milestones.length ? (
            <div className={styles.milestoneList}>
              {metrics.milestones.slice(0, 6).map((item) => (
                <Link
                  key={item.id}
                  href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`}
                >
                  <span className={styles.milestoneIcon}>
                    <Flag size={18} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.assignees.map((person) => person.name).join(", ") ||
                        "Needs an owner"}
                    </small>
                  </span>
                  <span
                    className={styles.milestoneDate}
                    data-risk={Boolean(item.dueDate && item.dueDate < today)}
                  >
                    {item.dueDate
                      ? formatLiveDateOnly(item.dueDate, timezone)
                      : "Set a date"}
                  </span>
                  <ArrowRight size={16} />
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.emptyInline}>
              <Flag size={20} />
              <p>
                No open milestones in this scope. Create a task of type
                Milestone to make the next deliverable visible.
              </p>
            </div>
          )}
          {metrics.milestones.length > 6 && (
            <button
              type="button"
              className={styles.textAction}
              onClick={() =>
                onFocus({ kind: "milestones", label: "Open milestones" })
              }
            >
              View all {metrics.milestones.length} milestones{" "}
              <ArrowRight size={14} />
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
