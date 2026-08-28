"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FileCheck2,
  Flag,
  Flame,
  Focus,
  Gauge,
  ListFilter,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Target,
  UserRound,
  X,
} from "lucide-react";
import {
  demoBoards,
  demoWorkspaces,
  demoItems,
  type Priority,
  type WorkItem,
  type WorkItemType,
} from "@founderhq/core";
import { useMemo, useState } from "react";
import { useCapturedWork } from "@/lib/captured-work";
import { useWorkspace } from "@/lib/workspace-context";
import { workspaceHref } from "@/lib/workspace-routes";
import { Hint, useLearningCenter } from "./learning-center";

const currentUser = "Mohammed Zaman";
const today = "2026-08-27";
const weekEnd = "2026-09-03";
const dailyTarget = 5;

type WorkStatus = WorkItem["status"];
type WorkScope = "assigned" | "following" | "created";
type WorkMode = "all" | "focus" | "quick" | "blocked";
type WorkGroupId = "overdue" | "today" | "week" | "later" | "completed";

interface MyWorkRecord {
  id: string;
  title: string;
  type: WorkItemType;
  priority: Priority;
  status: WorkStatus;
  dueDate: string | undefined;
  assignee: string;
  workspaceId: string;
  boardId: string;
  following: boolean;
  createdByMe: boolean;
  source: "workspace" | "capture";
  notes: string;
}

interface WorkEdit {
  title?: string;
  priority?: Priority;
  status?: WorkStatus;
  dueDate?: string | undefined;
  assignee?: string;
  notes?: string;
}

interface WorkToast {
  message: string;
  undo?: {
    id: string;
    status: WorkStatus;
    completedDelta: number;
  };
}

const workspaceRecords: MyWorkRecord[] = demoItems.map((item, index) => ({
  id: item.id,
  title: item.title,
  type: item.type,
  priority: item.priority,
  status: item.status,
  dueDate: item.dueDate,
  assignee: item.assignee ?? "Unassigned",
  workspaceId: item.workspaceId,
  boardId: item.boardId,
  following: index % 3 === 0 || item.assignee === currentUser,
  createdByMe:
    index % 4 === 0 || (item.assignee === currentUser && index % 2 === 0),
  source: "workspace",
  notes:
    item.status === "blocked"
      ? "Capture the blocker, who can resolve it, and the next follow-up date."
      : "Add context, the expected outcome, or the next useful step.",
}));

const statusLabels: Record<WorkStatus, string> = {
  not_started: "Not started",
  working: "Working",
  blocked: "Blocked",
  review: "In review",
  done: "Done",
};

const priorityLabels: Record<Priority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
  none: "No priority",
};

const typeLabels: Record<WorkItemType, string> = {
  task: "Task",
  decision: "Decision",
  approval: "Approval",
  milestone: "Milestone",
  idea: "Idea",
  request: "Request",
};

const scopeLabels: Array<{ id: WorkScope; label: string }> = [
  { id: "assigned", label: "Assigned to me" },
  { id: "following", label: "Following" },
  { id: "created", label: "Created by me" },
];

const modeLabels: Array<{ id: WorkMode; label: string; icon: typeof Focus }> = [
  { id: "all", label: "All work", icon: ListFilter },
  { id: "focus", label: "Focus 3", icon: Target },
  { id: "quick", label: "Quick wins", icon: Sparkles },
  { id: "blocked", label: "Blocked", icon: AlertTriangle },
];

export function MyWorkWorkflow() {
  const capturedWork = useCapturedWork();
  const { scope: workspaceScope } = useWorkspace();
  const { openLearningCenter } = useLearningCenter();
  const [edits, setEdits] = useState<Record<string, WorkEdit>>({});
  const [scope, setScope] = useState<WorkScope>("assigned");
  const [mode, setMode] = useState<WorkMode>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [focusIds, setFocusIds] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<WorkGroupId[]>(["completed"]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [completedToday, setCompletedToday] = useState(2);
  const [toast, setToast] = useState<WorkToast | null>(null);

  const records = useMemo(() => {
    const allowedWorkspaceIds = new Set(
      workspaceScope.workspaces.map((project) => project.id),
    );
    const captures: MyWorkRecord[] = capturedWork
      .filter((item) => ["task", "milestone", "request"].includes(item.type))
      .map((item) => ({
        id: item.id,
        title: item.title,
        type: item.type as WorkItemType,
        priority: item.priority,
        status: "not_started",
        dueDate: item.dueDate,
        assignee: item.owner,
        workspaceId: item.workspaceId,
        boardId: item.boardId,
        following: item.owner === currentUser,
        createdByMe: true,
        source: "capture",
        notes: item.details ?? "Captured from Inbox. Add the next useful step.",
      }));
    return [...workspaceRecords, ...captures]
      .filter((item) => allowedWorkspaceIds.has(item.workspaceId))
      .map((item) => ({
        ...item,
        ...edits[item.id],
      }));
  }, [capturedWork, edits, workspaceScope.workspaces]);

  const counts = useMemo(
    () => ({
      assigned: records.filter((item) => item.assignee === currentUser).length,
      following: records.filter((item) => item.following).length,
      created: records.filter((item) => item.createdByMe).length,
    }),
    [records],
  );

  const scopeRecords = useMemo(
    () => records.filter((item) => isInScope(item, scope)),
    [records, scope],
  );

  const summary = useMemo(() => {
    const active = scopeRecords.filter((item) => item.status !== "done");
    return {
      total: active.length,
      overdue: active.filter((item) => item.dueDate && item.dueDate < today)
        .length,
      today: active.filter((item) => item.dueDate === today).length,
      blocked: active.filter((item) => item.status === "blocked").length,
      review: active.filter((item) => item.status === "review").length,
    };
  }, [scopeRecords]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return scopeRecords
      .filter((item) => {
        if (mode === "focus" && !focusIds.includes(item.id)) return false;
        if (
          mode === "quick" &&
          (item.status === "blocked" ||
            item.status === "done" ||
            ["urgent", "high"].includes(item.priority) ||
            ["decision", "approval"].includes(item.type))
        )
          return false;
        if (mode === "blocked" && item.status !== "blocked") return false;
        if (statusFilter === "open" && item.status === "done") return false;
        if (
          statusFilter !== "all" &&
          statusFilter !== "open" &&
          item.status !== statusFilter
        )
          return false;
        if (typeFilter !== "all" && item.type !== typeFilter) return false;
        if (!normalizedQuery) return true;
        return [
          item.title,
          workspaceFor(item)?.name,
          typeLabels[item.type],
          item.assignee,
        ]
          .filter(Boolean)
          .some((value) =>
            value?.toLocaleLowerCase().includes(normalizedQuery),
          );
      })
      .sort(compareWork);
  }, [focusIds, mode, query, scopeRecords, statusFilter, typeFilter]);

  const groups = useMemo(
    () =>
      [
        {
          id: "overdue" as const,
          label: "Overdue",
          description: "Needs a new commitment or action today",
          items: filteredRecords.filter(
            (item) =>
              item.status !== "done" && item.dueDate && item.dueDate < today,
          ),
        },
        {
          id: "today" as const,
          label: "Today",
          description: "Committed for Thursday, 27 August",
          items: filteredRecords.filter(
            (item) => item.status !== "done" && item.dueDate === today,
          ),
        },
        {
          id: "week" as const,
          label: "This week",
          description: "Coming up in the next seven days",
          items: filteredRecords.filter(
            (item) =>
              item.status !== "done" &&
              item.dueDate &&
              item.dueDate > today &&
              item.dueDate <= weekEnd,
          ),
        },
        {
          id: "later" as const,
          label: "Later & unscheduled",
          description: "Good candidates for a future plan",
          items: filteredRecords.filter(
            (item) =>
              item.status !== "done" &&
              (!item.dueDate || item.dueDate > weekEnd),
          ),
        },
        {
          id: "completed" as const,
          label: "Completed",
          description: "Finished work stays available for context",
          items: filteredRecords.filter((item) => item.status === "done"),
        },
      ].filter((group) => group.items.length > 0),
    [filteredRecords],
  );

  const focusItems = focusIds
    .map((id) => records.find((item) => item.id === id))
    .filter((item): item is MyWorkRecord => Boolean(item));
  const selected = records.find((item) => item.id === selectedId) ?? null;
  const topRisk = scopeRecords
    .filter((item) => item.status !== "done")
    .sort(compareWork)[0];
  const progress = Math.min(
    100,
    Math.round((completedToday / dailyTarget) * 100),
  );
  const hasActiveFilters =
    query.length > 0 ||
    statusFilter !== "all" ||
    typeFilter !== "all" ||
    mode !== "all";

  function patchItem(id: string, patch: WorkEdit) {
    setEdits((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  function toggleDone(item: MyWorkRecord) {
    const nextStatus: WorkStatus = item.status === "done" ? "working" : "done";
    const delta = item.status === "done" ? -1 : 1;
    patchItem(item.id, { status: nextStatus });
    setCompletedToday((current) => Math.max(0, current + delta));
    setToast({
      message:
        nextStatus === "done"
          ? `Completed “${item.title}”. Nice work.`
          : `Reopened “${item.title}”.`,
      undo: { id: item.id, status: item.status, completedDelta: delta },
    });
  }

  function undoLastAction() {
    if (!toast?.undo) return;
    patchItem(toast.undo.id, { status: toast.undo.status });
    setCompletedToday((current) =>
      Math.max(0, current - toast.undo!.completedDelta),
    );
    setToast(null);
  }

  function toggleFocus(id: string) {
    if (focusIds.includes(id)) {
      setFocusIds((current) => current.filter((itemId) => itemId !== id));
      return;
    }
    if (focusIds.length >= 3) {
      setToast({
        message: "Focus 3 is full. Remove one item before adding another.",
      });
      return;
    }
    setFocusIds((current) => [...current, id]);
    setToast({ message: "Added to today’s Focus 3." });
  }

  function planMyDay() {
    const planned = scopeRecords
      .filter((item) => item.status !== "done")
      .sort(compareWork)
      .slice(0, 3)
      .map((item) => item.id);
    setFocusIds(planned);
    setMode("focus");
    setToast({
      message: planned.length
        ? `Built a ${planned.length}-item plan from urgency, blockers, and due dates.`
        : "You’re clear—there is no open work to plan.",
    });
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setTypeFilter("all");
    setMode("all");
  }

  return (
    <div className="my-work-complete">
      {toast && (
        <div
          className="workflow-toast success-toast my-work-toast"
          role="status"
        >
          <CheckCircle2 size={16} />
          <span>{toast.message}</span>
          {toast.undo && (
            <button className="toast-undo" onClick={undoLastAction}>
              <RotateCcw size={12} /> Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}

      <section className="my-work-summary" aria-label="My Work summary">
        <article className="attention">
          <span>
            <Flame size={17} />
          </span>
          <div>
            <strong>{summary.overdue}</strong>
            <small>Overdue</small>
          </div>
          <em>{summary.overdue ? "Needs attention" : "All clear"}</em>
        </article>
        <article>
          <span>
            <CalendarDays size={17} />
          </span>
          <div>
            <strong>{summary.today}</strong>
            <small>Due today</small>
          </div>
          <em>{summary.today ? "Protect time" : "No deadline"}</em>
        </article>
        <article className="risk">
          <span>
            <AlertTriangle size={17} />
          </span>
          <div>
            <strong>{summary.blocked}</strong>
            <small>Blocked</small>
          </div>
          <em>{summary.blocked ? "Unblock next" : "Moving well"}</em>
        </article>
        <article className="review">
          <span>
            <FileCheck2 size={17} />
          </span>
          <div>
            <strong>{summary.review}</strong>
            <small>In review</small>
          </div>
          <em>{summary.review ? "Close the loop" : "Nothing waiting"}</em>
        </article>
      </section>

      <section className="daily-intent-card">
        <div className="daily-intent-copy">
          <span className="intent-eyebrow">
            <Sparkles size={13} /> Today, with intent
          </span>
          <h2>
            {summary.overdue
              ? `Recover ${summary.overdue} overdue ${summary.overdue === 1 ? "commitment" : "commitments"}, then protect the launch work.`
              : "Your commitments are under control. Choose the three that create momentum."}
            <Hint resourceId="my-work" />
          </h2>
          <p>
            TREVV ranks work by urgency, blockers, and due date. You stay in
            control of what makes the cut.
          </p>
          <div>
            <button className="primary-button" onClick={planMyDay}>
              <Sparkles size={15} /> Plan my day
            </button>
            {focusIds.length > 0 && (
              <button
                className="quiet-work-button"
                onClick={() => setFocusIds([])}
              >
                Clear plan
              </button>
            )}
          </div>
        </div>
        <div className="focus-three-board">
          <header>
            <div>
              <Target size={16} />
              <strong>Focus 3</strong>
              <span>{focusItems.length}/3 planned</span>
            </div>
            <Hint resourceId="my-work" />
          </header>
          <div className="focus-three-slots">
            {[0, 1, 2].map((slot) => {
              const item = focusItems[slot];
              return item ? (
                <article key={item.id}>
                  <span>{slot + 1}</span>
                  <button onClick={() => setSelectedId(item.id)}>
                    <strong>{item.title}</strong>
                    <small>
                      {workspaceFor(item)?.name ?? "Inbox"} · {dueLabel(item)}
                    </small>
                  </button>
                  <button
                    aria-label={`Start ${item.title}`}
                    title="Start work"
                    onClick={() => {
                      patchItem(item.id, { status: "working" });
                      setToast({
                        message: `“${item.title}” is now in progress.`,
                      });
                    }}
                  >
                    <Play size={13} />
                  </button>
                  <button
                    aria-label={`Remove ${item.title} from Focus 3`}
                    title="Remove from Focus 3"
                    onClick={() => toggleFocus(item.id)}
                  >
                    <X size={13} />
                  </button>
                </article>
              ) : (
                <button
                  className="empty-focus-slot"
                  key={slot}
                  onClick={() => setMode("all")}
                >
                  <span>{slot + 1}</span>
                  <div>
                    <strong>Choose a priority</strong>
                    <small>Star any work item below</small>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <nav
        className="my-work-scope-tabs"
        aria-label="My Work ownership views"
        role="tablist"
      >
        {scopeLabels.map((item) => (
          <button
            aria-selected={scope === item.id}
            className={scope === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setScope(item.id)}
            role="tab"
          >
            {item.label}
            <b>{counts[item.id]}</b>
          </button>
        ))}
      </nav>

      <div className="my-work-command-bar">
        <div className="my-work-mode-chips" aria-label="Work views">
          {modeLabels.map((item) => {
            const Icon = item.icon;
            return (
              <button
                aria-pressed={mode === item.id}
                className={mode === item.id ? "active" : ""}
                key={item.id}
                onClick={() => setMode(item.id)}
              >
                <Icon size={13} /> {item.label}
                {item.id === "focus" && focusIds.length > 0 && (
                  <b>{focusIds.length}</b>
                )}
              </button>
            );
          })}
        </div>
        <label className="my-work-search">
          <Search size={14} />
          <input
            aria-label="Search My Work"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search work…"
            value={query}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery("")}>
              <X size={12} />
            </button>
          )}
        </label>
        <label className="my-work-select">
          <span>Status</span>
          <select
            aria-label="Filter by status"
            onChange={(event) => setStatusFilter(event.target.value)}
            value={statusFilter}
          >
            <option value="all">All statuses</option>
            <option value="open">Open only</option>
            <option value="working">Working</option>
            <option value="review">In review</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className="my-work-select">
          <span>Type</span>
          <select
            aria-label="Filter by type"
            onChange={(event) => setTypeFilter(event.target.value)}
            value={typeFilter}
          >
            <option value="all">All types</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="my-work-content-grid">
        <div className="my-work-list">
          {groups.length > 0 ? (
            groups.map((group) => (
              <section
                className={`my-work-group group-${group.id}`}
                key={group.id}
              >
                <button
                  aria-expanded={!collapsed.includes(group.id)}
                  className="my-work-group-header"
                  onClick={() =>
                    setCollapsed((current) =>
                      current.includes(group.id)
                        ? current.filter((id) => id !== group.id)
                        : [...current, group.id],
                    )
                  }
                >
                  <span className="group-chevron">
                    <ChevronDown size={14} />
                  </span>
                  <span className="group-marker" />
                  <div>
                    <strong>{group.label}</strong>
                    <small>{group.description}</small>
                  </div>
                  <b>{group.items.length}</b>
                </button>
                {!collapsed.includes(group.id) && (
                  <div className="my-work-rows">
                    {group.items.map((item) => (
                      <WorkRow
                        focused={focusIds.includes(item.id)}
                        item={item}
                        key={item.id}
                        onOpen={() => setSelectedId(item.id)}
                        onToggleDone={() => toggleDone(item)}
                        onToggleFocus={() => toggleFocus(item.id)}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))
          ) : (
            <section className="my-work-empty-state">
              <span>
                <CheckCircle2 size={23} />
              </span>
              <h2>
                {mode === "focus"
                  ? "Your Focus 3 is waiting"
                  : "No work matches this view"}
              </h2>
              <p>
                {mode === "focus"
                  ? "Use Plan my day or star work items to build a focused plan."
                  : "Try a broader status, type, or search term."}
              </p>
              <button
                className="primary-button"
                onClick={mode === "focus" ? planMyDay : clearFilters}
              >
                {mode === "focus" ? (
                  <>
                    <Sparkles size={14} /> Build my plan
                  </>
                ) : (
                  <>
                    <RotateCcw size={14} /> Reset filters
                  </>
                )}
              </button>
            </section>
          )}
          {hasActiveFilters && filteredRecords.length > 0 && (
            <button className="clear-work-filters" onClick={clearFilters}>
              <RotateCcw size={12} /> Clear view and filters
            </button>
          )}
        </div>

        <aside
          className="my-work-insights"
          aria-label="Daily momentum and guidance"
        >
          <section className="momentum-card">
            <header>
              <div>
                <Gauge size={15} />
                <strong>Daily momentum</strong>
              </div>
              <Hint resourceId="my-work" />
            </header>
            <div className="momentum-body">
              <div
                className="momentum-ring"
                style={{
                  background: `conic-gradient(var(--fh-primary) ${progress}%, var(--fh-primary-soft) ${progress}% 100%)`,
                }}
              >
                <span>
                  <b>{completedToday}</b>
                  <small>of {dailyTarget}</small>
                </span>
              </div>
              <div>
                <strong>
                  {progress >= 100
                    ? "Target reached"
                    : `${dailyTarget - completedToday} more for a strong day`}
                </strong>
                <p>
                  Completed work counts here. The target is a guide, not a
                  quota.
                </p>
              </div>
            </div>
          </section>

          <section className="work-nudge-card">
            <header>
              <span>
                <Flame size={14} />
              </span>
              <div>
                <strong>Best next move</strong>
                <small>Based on risk and timing</small>
              </div>
            </header>
            {topRisk ? (
              <button onClick={() => setSelectedId(topRisk.id)}>
                <strong>{topRisk.title}</strong>
                <span>
                  {topRisk.status === "blocked"
                    ? "Clear the blocker"
                    : dueLabel(topRisk)}{" "}
                  <ArrowRight size={12} />
                </span>
              </button>
            ) : (
              <p>Nothing needs attention right now.</p>
            )}
          </section>

          <section className="work-guide-card">
            <header>
              <Sparkles size={14} />
              <strong>A calmer workday</strong>
            </header>
            <ul>
              <li>
                <span>1</span>
                <p>
                  <strong>Pick three</strong>
                  <small>Define what “enough” looks like today.</small>
                </p>
              </li>
              <li>
                <span>2</span>
                <p>
                  <strong>Clear one blocker</strong>
                  <small>Momentum often starts with a conversation.</small>
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  <strong>Close the loop</strong>
                  <small>Finish or reschedule overdue work.</small>
                </p>
              </li>
            </ul>
            <button type="button" onClick={() => openLearningCenter("my-work")}>
              Open My Work guide <ArrowRight size={12} />
            </button>
          </section>
        </aside>
      </div>

      {selected && (
        <WorkDetailDialog
          focused={focusIds.includes(selected.id)}
          item={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => {
            patchItem(selected.id, patch);
            setToast({
              message: `Saved changes to “${patch.title ?? selected.title}”.`,
            });
            setSelectedId(null);
          }}
          onToggleDone={() => toggleDone(selected)}
          onToggleFocus={() => toggleFocus(selected.id)}
        />
      )}
    </div>
  );
}

function WorkRow({
  item,
  focused,
  onOpen,
  onToggleDone,
  onToggleFocus,
}: {
  item: MyWorkRecord;
  focused: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  onToggleFocus: () => void;
}) {
  const workspace = workspaceFor(item);
  const board = demoBoards.find((candidate) => candidate.id === item.boardId);
  return (
    <article
      className={`my-work-row ${item.status === "done" ? "is-done" : ""}`}
    >
      <button
        aria-label={
          item.status === "done"
            ? `Reopen ${item.title}`
            : `Complete ${item.title}`
        }
        className="work-complete-toggle"
        onClick={onToggleDone}
        title={item.status === "done" ? "Reopen work" : "Mark complete"}
      >
        {item.status === "done" ? <Check size={13} /> : <Circle size={15} />}
      </button>
      <button className="work-row-copy" onClick={onOpen}>
        <span className={`work-type-icon ${item.type}`}>
          <WorkTypeIcon type={item.type} />
        </span>
        <span>
          <strong>{item.title}</strong>
          <small>
            {workspace?.name ?? "Inbox"} ·{" "}
            {board?.name ?? typeLabels[item.type]}
          </small>
        </span>
      </button>
      <span className={`work-priority priority-${item.priority}`}>
        <Flag size={11} /> {priorityLabels[item.priority]}
      </span>
      <button className={`focus-status ${item.status}`} onClick={onOpen}>
        {statusLabels[item.status]}
      </button>
      <time
        className={
          item.dueDate && item.dueDate < today && item.status !== "done"
            ? "is-overdue"
            : ""
        }
      >
        {dueLabel(item)}
      </time>
      <button
        aria-label={
          focused
            ? `Remove ${item.title} from Focus 3`
            : `Add ${item.title} to Focus 3`
        }
        aria-pressed={focused}
        className={`work-focus-toggle ${focused ? "active" : ""}`}
        onClick={onToggleFocus}
        title={focused ? "Remove from Focus 3" : "Add to Focus 3"}
      >
        <Star size={14} fill={focused ? "currentColor" : "none"} />
      </button>
      <a
        aria-label={`Open ${item.title} on its board`}
        href={boardHref(item)}
        title="Open board"
      >
        <ExternalLink size={13} />
      </a>
    </article>
  );
}

function WorkDetailDialog({
  item,
  focused,
  onClose,
  onSave,
  onToggleDone,
  onToggleFocus,
}: {
  item: MyWorkRecord;
  focused: boolean;
  onClose: () => void;
  onSave: (patch: WorkEdit) => void;
  onToggleDone: () => void;
  onToggleFocus: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState<WorkStatus>(item.status);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [dueDate, setDueDate] = useState(item.dueDate ?? "");
  const [assignee, setAssignee] = useState(item.assignee);
  const [notes, setNotes] = useState(item.notes);
  return (
    <div
      className="workflow-dialog-layer my-work-detail-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="my-work-detail-title"
        aria-modal="true"
        className="workflow-dialog my-work-detail-dialog"
        role="dialog"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              title: title.trim() || item.title,
              status,
              priority,
              dueDate: dueDate || undefined,
              assignee,
              notes,
            });
          }}
        >
          <header>
            <span>
              <WorkTypeIcon type={item.type} />
            </span>
            <div>
              <p>
                {typeLabels[item.type]} · {workspaceFor(item)?.name ?? "Inbox"}
              </p>
              <h2 id="my-work-detail-title">Work details</h2>
            </div>
            <button
              aria-label="Close work details"
              onClick={onClose}
              type="button"
            >
              <X size={16} />
            </button>
          </header>
          <div className="workflow-dialog-body">
            <div className="work-dialog-highlight">
              <Target size={16} />
              <div>
                <strong>
                  {focused ? "In today’s Focus 3" : "Not in today’s focus"}
                </strong>
                <span>
                  {focused
                    ? "This is one of your three daily commitments."
                    : "Add it when this deserves protected attention."}
                </span>
              </div>
              <button onClick={onToggleFocus} type="button">
                <Star size={13} fill={focused ? "currentColor" : "none"} />{" "}
                {focused ? "Remove" : "Add"}
              </button>
            </div>
            <label>
              <span>Title</span>
              <input
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>
            <div className="work-dialog-field-grid">
              <label>
                <span>Status</span>
                <select
                  onChange={(event) =>
                    setStatus(event.target.value as WorkStatus)
                  }
                  value={status}
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Priority</span>
                <select
                  onChange={(event) =>
                    setPriority(event.target.value as Priority)
                  }
                  value={priority}
                >
                  {Object.entries(priorityLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Due date</span>
                <input
                  min="2026-01-01"
                  onChange={(event) => setDueDate(event.target.value)}
                  type="date"
                  value={dueDate}
                />
              </label>
              <label>
                <span>Owner</span>
                <select
                  onChange={(event) => setAssignee(event.target.value)}
                  value={assignee}
                >
                  {[
                    currentUser,
                    "Amira Demir",
                    "Nora Klein",
                    "Elias Hart",
                    "Tim Bauer",
                    "Unassigned",
                  ].map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>Working notes</span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Outcome, context, blocker, or next step…"
                value={notes}
              />
            </label>
            <p className="workflow-safety-note">
              <UserRound size={14} /> Changes update this personal work view
              immediately. Open the board for its full history and
              collaboration.
            </p>
          </div>
          <footer className="workflow-dialog-actions my-work-dialog-actions">
            <a href={boardHref(item)}>
              Open board <ExternalLink size={12} />
            </a>
            <div>
              <button onClick={onToggleDone} type="button">
                {item.status === "done" ? "Reopen" : "Mark complete"}
              </button>
              <button className="primary-button" type="submit">
                Save changes
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

function WorkTypeIcon({ type }: { type: WorkItemType }) {
  if (type === "milestone") return <Flag size={14} />;
  if (type === "approval") return <FileCheck2 size={14} />;
  if (type === "decision") return <Gauge size={14} />;
  if (type === "request") return <ArrowRight size={14} />;
  if (type === "idea") return <Sparkles size={14} />;
  return <CheckCircle2 size={14} />;
}

function isInScope(item: MyWorkRecord, scope: WorkScope) {
  if (scope === "assigned") return item.assignee === currentUser;
  if (scope === "following") return item.following;
  return item.createdByMe;
}

function compareWork(a: MyWorkRecord, b: MyWorkRecord) {
  return (
    workScore(b) - workScore(a) ||
    (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")
  );
}

function workScore(item: MyWorkRecord) {
  if (item.status === "done") return -100;
  let score = 0;
  if (item.status === "blocked") score += 45;
  if (item.dueDate && item.dueDate < today) score += 40;
  if (item.dueDate === today) score += 30;
  if (item.priority === "urgent") score += 25;
  if (item.priority === "high") score += 14;
  if (item.status === "review") score += 8;
  return score;
}

function workspaceFor(item: MyWorkRecord) {
  return demoWorkspaces.find((workspace) => workspace.id === item.workspaceId);
}

function boardHref(item: MyWorkRecord) {
  const workspace = workspaceFor(item);
  return workspace
    ? `${workspaceHref(workspace.slug)}/boards/${item.boardId}`
    : "/app/portfolio";
}

function dueLabel(item: MyWorkRecord) {
  if (!item.dueDate) return "No date";
  if (item.dueDate === today) return "Today";
  if (item.dueDate < today && item.status !== "done") {
    const days = Math.max(
      1,
      Math.round((Date.parse(today) - Date.parse(item.dueDate)) / 86_400_000),
    );
    return `${days}d overdue`;
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${item.dueDate}T12:00:00Z`));
}
