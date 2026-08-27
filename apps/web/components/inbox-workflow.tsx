"use client";

import {
  AlarmClock,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  FileQuestion,
  Filter,
  Inbox,
  Lightbulb,
  Link2,
  ListTodo,
  MessageSquareText,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  TimerReset,
  X,
} from "lucide-react";
import { demoBoards, demoHubs } from "@founderhq/core";
import Link from "next/link";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import {
  storeCapturedWork,
  useCapturedWork,
  type CapturedWorkItem,
  type CapturedWorkType,
} from "@/lib/captured-work";
import { Hint } from "./learning-center";

type InboxCategory = "decision" | "mention" | "approval" | "follow-up";
type InboxDisposition = "open" | "snoozed" | "done";
type InboxPriority = "urgent" | "high" | "normal";

interface InboxAction {
  id: string;
  category: InboxCategory;
  title: string;
  summary: string;
  source: string;
  hubId: string;
  receivedAt: string;
  priority: InboxPriority;
  route: string;
  disposition: InboxDisposition;
  snoozedUntil?: string;
}

export interface EmailInboxAction {
  id: string;
  title: string;
  summary: string;
  source: string;
  receivedAt: string;
}

const initialActions: InboxAction[] = [
  {
    id: "inbox-1",
    category: "decision",
    title: "Select onboarding navigation",
    summary:
      "Nora added a recommendation and needs your choice before the pilot build continues.",
    source: "Nora Klein",
    hubId: "hub-mealflow",
    receivedAt: "8 min ago",
    priority: "urgent",
    route: "/app/decisions",
    disposition: "open",
  },
  {
    id: "inbox-2",
    category: "mention",
    title: "Can you confirm the compliance assumption?",
    summary:
      "Amira mentioned you in the evidence checklist and highlighted one unresolved manufacturer claim.",
    source: "Amira Demir",
    hubId: "hub-northstar",
    receivedAt: "24 min ago",
    priority: "high",
    route: "/app/hubs/northstar-apparel",
    disposition: "open",
  },
  {
    id: "inbox-3",
    category: "approval",
    title: "Review client storefront repair",
    summary:
      "Jana submitted the repaired storefront with before-and-after evidence for final review.",
    source: "Jana Roth",
    hubId: "hub-localreach",
    receivedAt: "1 hr ago",
    priority: "high",
    route: "/app/approvals",
    disposition: "open",
  },
  {
    id: "inbox-4",
    category: "follow-up",
    title: "Supplier evidence follow-up is due",
    summary:
      "TREVV brought this back because the promised supplier declaration has not been attached.",
    source: "TREVV",
    hubId: "hub-centralops",
    receivedAt: "Today, 08:00",
    priority: "urgent",
    route: "/app/waiting",
    disposition: "open",
  },
  {
    id: "inbox-5",
    category: "mention",
    title: "Add launch copy to the weekly update",
    summary:
      "Elias asked whether the approved launch wording should appear in this week's stakeholder summary.",
    source: "Elias Hart",
    hubId: "hub-northstar",
    receivedAt: "Yesterday",
    priority: "normal",
    route: "/app/hubs/northstar-apparel",
    disposition: "snoozed",
    snoozedUntil: "Tomorrow, 09:00",
  },
];

const categoryLabels: Record<InboxCategory, string> = {
  decision: "Decision request",
  mention: "Mention",
  approval: "Approval request",
  "follow-up": "Follow-up",
};

export function InboxWorkflow({
  emailActions = [],
}: {
  emailActions?: EmailInboxAction[];
}) {
  const [actions, setActions] = useState<InboxAction[]>(() => [
    ...emailActions.map((message) => ({
      ...message,
      category: "follow-up" as const,
      hubId: "hub-centralops",
      priority: "normal" as const,
      route: "/app/inbox",
      disposition: "open" as const,
    })),
    ...initialActions,
  ]);
  const [view, setView] = useState<InboxDisposition>("open");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<InboxCategory | "all">("all");
  const [hubId, setHubId] = useState("all");
  const [priority, setPriority] = useState<InboxPriority | "all">("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [snoozeIds, setSnoozeIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{
    items: InboxAction[];
    completedDelta: number;
  } | null>(null);
  const [completedToday, setCompletedToday] = useState(0);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const priorityWeight = { urgent: 0, high: 1, normal: 2 };
    return actions
      .filter((action) => {
        if (action.disposition !== view) return false;
        if (category !== "all" && action.category !== category) return false;
        if (hubId !== "all" && action.hubId !== hubId) return false;
        if (priority !== "all" && action.priority !== priority) return false;
        return (
          !normalized ||
          `${action.title} ${action.summary} ${action.source}`
            .toLocaleLowerCase()
            .includes(normalized)
        );
      })
      .sort(
        (left, right) =>
          priorityWeight[left.priority] - priorityWeight[right.priority],
      );
  }, [actions, category, hubId, priority, query, view]);

  const selectedAction = actions.find((action) => action.id === detailId);
  const openActions = actions.filter((action) => action.disposition === "open");
  const activeFilterCount = [category, hubId, priority].filter(
    (value) => value !== "all",
  ).length;

  const moveActions = (
    ids: string[],
    disposition: InboxDisposition,
    message: string,
    snoozedUntil?: string,
  ) => {
    const affected = actions.filter((action) => ids.includes(action.id));
    if (!affected.length) return;
    setUndo({
      items: affected,
      completedDelta: disposition === "done" ? ids.length : 0,
    });
    setActions((current) =>
      current.map((action) =>
        ids.includes(action.id)
          ? {
              ...action,
              disposition,
              ...(snoozedUntil ? { snoozedUntil } : {}),
            }
          : action,
      ),
    );
    if (disposition === "done")
      setCompletedToday((count) => count + ids.length);
    setSelectedIds([]);
    setNotice(message);
  };

  const restoreUndo = () => {
    if (!undo) return;
    setActions((current) =>
      current.map(
        (action) =>
          undo.items.find((previous) => previous.id === action.id) ?? action,
      ),
    );
    setCompletedToday((count) => Math.max(0, count - undo.completedDelta));
    setNotice("Last Inbox action restored.");
    setUndo(null);
  };

  return (
    <div className="inbox-workflow">
      {notice && (
        <div className="workflow-toast inbox-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          {undo && (
            <button className="toast-action" onClick={restoreUndo}>
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <QuickCapture onCaptured={(message) => setNotice(message)} />

      <section className="inbox-zero-guide">
        <div>
          <span>
            <Sparkles size={16} />
          </span>
          <div>
            <strong>Clear the signal, keep the context</strong>
            <p>
              {openActions.length} open · about {openActions.length * 2} minutes
              to triage · {completedToday} completed today
            </p>
          </div>
        </div>
        <button
          disabled={!openActions.length}
          onClick={() => setDetailId(openActions[0]?.id ?? null)}
        >
          Triage next <ArrowRight size={13} />
        </button>
      </section>

      <section className="inbox-list inbox-list-complete">
        <header>
          <div>
            <h2 className="page-title-with-hint">
              Actionable Inbox <Hint resourceId="inbox" />
            </h2>
            <span>Communication and reminders that need a response.</span>
          </div>
          <button
            className={filtersOpen || activeFilterCount ? "active" : ""}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Filter size={14} /> Filter
            {activeFilterCount > 0 && <b>{activeFilterCount}</b>}
          </button>
        </header>

        <div className="inbox-toolbar">
          <div
            className="inbox-view-tabs"
            role="tablist"
            aria-label="Inbox state"
          >
            {(["open", "snoozed", "done"] as InboxDisposition[]).map(
              (state) => (
                <button
                  role="tab"
                  aria-selected={view === state}
                  className={view === state ? "active" : ""}
                  key={state}
                  onClick={() => {
                    setView(state);
                    setSelectedIds([]);
                  }}
                >
                  {state === "open"
                    ? "Needs response"
                    : state[0]!.toUpperCase() + state.slice(1)}
                  <b>
                    {
                      actions.filter((action) => action.disposition === state)
                        .length
                    }
                  </b>
                </button>
              ),
            )}
          </div>
          <label className="inbox-search">
            <Search size={14} />
            <span className="sr-only">Search Inbox</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Inbox…"
            />
          </label>
        </div>

        {filtersOpen && (
          <div className="inbox-filter-panel">
            <label>
              <span>Request type</span>
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as typeof category)
                }
              >
                <option value="all">All types</option>
                {(Object.keys(categoryLabels) as InboxCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {categoryLabels[key]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Hub</span>
              <select
                value={hubId}
                onChange={(event) => setHubId(event.target.value)}
              >
                <option value="all">All Hubs</option>
                {demoHubs
                  .filter((hub) => !hub.id.startsWith("original-"))
                  .map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Priority</span>
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as typeof priority)
                }
              >
                <option value="all">All priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="normal">Normal</option>
              </select>
            </label>
            <button
              onClick={() => {
                setCategory("all");
                setHubId("all");
                setPriority("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {visible.length > 0 && (
          <div className="inbox-selection-bar">
            <label>
              <input
                type="checkbox"
                checked={visible.every((action) =>
                  selectedIds.includes(action.id),
                )}
                onChange={(event) =>
                  setSelectedIds(
                    event.target.checked
                      ? visible.map((action) => action.id)
                      : [],
                  )
                }
              />
              <span>
                {selectedIds.length
                  ? `${selectedIds.length} selected`
                  : "Select all"}
              </span>
            </label>
            {selectedIds.length > 0 && view === "open" && (
              <div>
                <button
                  onClick={() =>
                    moveActions(
                      selectedIds,
                      "done",
                      `${selectedIds.length} Inbox items completed.`,
                    )
                  }
                >
                  <CheckCircle2 size={13} /> Done
                </button>
                <button onClick={() => setSnoozeIds(selectedIds)}>
                  <AlarmClock size={13} /> Snooze
                </button>
              </div>
            )}
          </div>
        )}

        <div className="inbox-action-rows">
          {visible.map((action) => {
            const hub = demoHubs.find(
              (candidate) => candidate.id === action.hubId,
            );
            return (
              <article
                key={action.id}
                className={`inbox-complete-row priority-${action.priority}`}
              >
                <label className="inbox-select-row">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(action.id)}
                    onChange={() =>
                      setSelectedIds((current) =>
                        current.includes(action.id)
                          ? current.filter((id) => id !== action.id)
                          : [...current, action.id],
                      )
                    }
                  />
                  <span className="sr-only">Select {action.title}</span>
                </label>
                <span className={`inbox-item-icon category-${action.category}`}>
                  {iconForCategory(action.category)}
                </span>
                <button
                  className="inbox-row-copy"
                  onClick={() => setDetailId(action.id)}
                >
                  <span>
                    <b>{categoryLabels[action.category]}</b>
                    <i className={`inbox-priority ${action.priority}`}>
                      {action.priority}
                    </i>
                  </span>
                  <strong>{action.title}</strong>
                  <small>
                    {action.source} · {hub?.name ?? "No Hub"} ·{" "}
                    {action.receivedAt}
                  </small>
                  {action.disposition === "snoozed" && (
                    <em>
                      <TimerReset size={11} /> Returns {action.snoozedUntil}
                    </em>
                  )}
                </button>
                <div className="inbox-row-actions">
                  {action.disposition === "open" ? (
                    <>
                      <button
                        onClick={() =>
                          moveActions(
                            [action.id],
                            "done",
                            `Completed “${action.title}”.`,
                          )
                        }
                      >
                        Done
                      </button>
                      <button onClick={() => setSnoozeIds([action.id])}>
                        Snooze
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() =>
                        moveActions(
                          [action.id],
                          "open",
                          `Restored “${action.title}” to Needs response.`,
                        )
                      }
                    >
                      <RotateCcw size={12} /> Restore
                    </button>
                  )}
                  <button
                    aria-label={`Open ${action.title}`}
                    onClick={() => setDetailId(action.id)}
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {!visible.length && (
          <div className="inbox-clear inbox-clear-complete">
            <CheckCircle2 size={24} />
            <strong>
              {view === "open"
                ? "You are caught up"
                : `Nothing ${view} matches this view`}
            </strong>
            <span>
              {view === "open"
                ? "New requests will land here. Personal captures stay separate below Quick Capture."
                : "Change the filters or return to Needs response."}
            </span>
            {view !== "open" && (
              <button onClick={() => setView("open")}>
                Back to Needs response
              </button>
            )}
          </div>
        )}
      </section>

      {selectedAction && (
        <InboxDetailDialog
          action={selectedAction}
          onClose={() => setDetailId(null)}
          onDone={() => {
            moveActions(
              [selectedAction.id],
              "done",
              `Completed “${selectedAction.title}”.`,
            );
            setDetailId(null);
          }}
          onSnooze={() => {
            setSnoozeIds([selectedAction.id]);
            setDetailId(null);
          }}
          onAddToWork={() => {
            storeCapturedWork({
              id: `inbox-work-${Date.now()}`,
              type: "task",
              title: selectedAction.title,
              hubId: selectedAction.hubId,
              boardId:
                demoBoards.find((board) => board.hubId === selectedAction.hubId)
                  ?.id ?? "inbox",
              owner: "Mohammed Zaman",
              priority: selectedAction.priority,
              createdAt: new Date().toISOString(),
              sendToInbox: false,
              details: selectedAction.summary,
            });
            moveActions(
              [selectedAction.id],
              "done",
              `Added “${selectedAction.title}” to My Work.`,
            );
            setDetailId(null);
          }}
        />
      )}
      {snoozeIds.length > 0 && (
        <SnoozeDialog
          count={snoozeIds.length}
          onClose={() => setSnoozeIds([])}
          onConfirm={(until) => {
            moveActions(
              snoozeIds,
              "snoozed",
              `${snoozeIds.length} Inbox ${snoozeIds.length === 1 ? "item" : "items"} snoozed until ${until}.`,
              until,
            );
            setSnoozeIds([]);
          }}
        />
      )}
    </div>
  );
}

function QuickCapture({
  onCaptured,
}: {
  onCaptured: (message: string) => void;
}) {
  const capturedWork = useCapturedWork();
  const [draft, setDraft] = useState("");
  const [type, setType] = useState<CapturedWorkType>("task");
  const [hubId, setHubId] = useState("");
  const [datePreset, setDatePreset] = useState("none");
  const [customDate, setCustomDate] = useState("");
  const recent = capturedWork.slice(0, 4);
  const looksLikeLink = /^https?:\/\//i.test(draft.trim());
  const looksLikeDecision = /^(decide|choose|which|should we)/i.test(
    draft.trim(),
  );
  const dueDate =
    datePreset === "custom" ? customDate : dateFromPreset(datePreset);

  const capture = () => {
    if (!draft.trim()) return;
    const hub = demoHubs.find((candidate) => candidate.id === hubId);
    const board = demoBoards.find((candidate) => candidate.hubId === hubId);
    const title = captureTitle(draft.trim(), type);
    const item: CapturedWorkItem = {
      id: `quick-${Date.now()}`,
      type,
      title,
      hubId: hub?.id ?? "inbox",
      boardId: board?.id ?? "inbox",
      owner: "Mohammed Zaman",
      priority: "normal",
      ...(dueDate ? { dueDate } : {}),
      ...(type === "link"
        ? { evidenceUrl: draft.trim() }
        : { details: draft.trim() }),
      createdAt: new Date().toISOString(),
      sendToInbox: false,
    };
    storeCapturedWork(item);
    setDraft("");
    setDatePreset("none");
    setCustomDate("");
    onCaptured(
      `${captureTypeLabel(type)} captured${hub ? ` in ${hub.name}` : " for later organization"}.`,
    );
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      capture();
    }
  };

  return (
    <section className="capture-card quick-capture-separate capture-card-complete">
      <div className="capture-card-icon">
        <Sparkles size={18} />
      </div>
      <div>
        <header>
          <div>
            <h2 className="page-title-with-hint">
              Quick Capture <Hint resourceId="quick-capture" />
            </h2>
            <p>
              Catch the thought now. Personal capture stays separate from
              communication that needs a response.
            </p>
          </div>
          <span className="capture-shortcut">⌘ Enter</span>
        </header>
        <textarea
          id="inbox-quick-capture"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Capture a task, idea, link, note, request, or decision…"
        />

        {!draft && (
          <div className="capture-prompts">
            <span>Try a prompt</span>
            {(
              [
                ["Follow up with…", "request"],
                ["Idea: What if…", "idea"],
                ["Decision: Should we…", "decision"],
              ] as const
            ).map(([prompt, promptType]) => (
              <button
                key={prompt}
                onClick={() => {
                  setDraft(prompt);
                  setType(promptType as CapturedWorkType);
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {draft && (looksLikeLink || looksLikeDecision) && (
          <div className="capture-smart-suggestion">
            <Sparkles size={13} />
            <span>
              {looksLikeLink
                ? "This looks like a link."
                : "This sounds like a decision."}
            </span>
            <button
              onClick={() => setType(looksLikeLink ? "link" : "decision")}
            >
              Use {looksLikeLink ? "Link" : "Decision"}
            </button>
          </div>
        )}

        <footer>
          <div className="capture-field-row">
            <label>
              <span className="sr-only">Capture type</span>
              {iconForCapture(type)}
              <select
                value={type}
                onChange={(event) =>
                  setType(event.target.value as CapturedWorkType)
                }
              >
                <option value="task">Task</option>
                <option value="idea">Idea</option>
                <option value="note">Note</option>
                <option value="link">Link</option>
                <option value="request">Request</option>
                <option value="decision">Decision</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <label>
              <span className="sr-only">Capture Hub</span>
              <Inbox size={13} />
              <select
                value={hubId}
                onChange={(event) => setHubId(event.target.value)}
              >
                <option value="">Organize later</option>
                {demoHubs
                  .filter((hub) => !hub.id.startsWith("original-"))
                  .map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
              </select>
              <ChevronDown size={12} />
            </label>
            <label>
              <span className="sr-only">Capture due date</span>
              <CalendarClock size={13} />
              <select
                value={datePreset}
                onChange={(event) => setDatePreset(event.target.value)}
              >
                <option value="none">No date</option>
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                <option value="week">Next week</option>
                <option value="custom">Custom</option>
              </select>
              <ChevronDown size={12} />
            </label>
            {datePreset === "custom" && (
              <input
                className="capture-custom-date"
                type="date"
                value={customDate}
                onChange={(event) => setCustomDate(event.target.value)}
                aria-label="Custom capture date"
              />
            )}
          </div>
          <button
            className="primary-button"
            onClick={capture}
            disabled={!draft.trim() || (datePreset === "custom" && !customDate)}
          >
            <Plus size={14} /> Capture
          </button>
        </footer>

        {recent.length > 0 && (
          <div className="recent-captures">
            <strong>Recently captured</strong>
            <div>
              {recent.map((item) => (
                <span key={item.id}>
                  {iconForCapture(item.type)}
                  <b>{item.title}</b>
                  <small>{captureTypeLabel(item.type)}</small>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function InboxDetailDialog({
  action,
  onClose,
  onDone,
  onSnooze,
  onAddToWork,
}: {
  action: InboxAction;
  onClose: () => void;
  onDone: () => void;
  onSnooze: () => void;
  onAddToWork: () => void;
}) {
  const [response, setResponse] = useState("");
  const hub = demoHubs.find((candidate) => candidate.id === action.hubId);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!response.trim()) return;
    onDone();
  };
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog inbox-detail-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-detail-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className={`dialog-title-icon category-${action.category}`}>
            {iconForCategory(action.category)}
          </span>
          <div>
            <p>
              {categoryLabels[action.category]} · {action.priority}
            </p>
            <h2 id="inbox-detail-title">{action.title}</h2>
          </div>
          <Hint resourceId="inbox" />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close Inbox item"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <div className="inbox-detail-context">
            <span className="avatar">{initialsFor(action.source)}</span>
            <div>
              <strong>{action.source}</strong>
              <small>
                {hub?.name ?? "No Hub"} · {action.receivedAt}
              </small>
            </div>
            <span className={`inbox-priority ${action.priority}`}>
              {action.priority}
            </span>
          </div>
          <p className="inbox-detail-summary">{action.summary}</p>
          <dl className="inbox-detail-meta">
            <div>
              <dt>Why it is here</dt>
              <dd>{categoryLabels[action.category]} needs your response</dd>
            </div>
            <div>
              <dt>Suggested next move</dt>
              <dd>
                {action.category === "decision"
                  ? "Review the recommendation and record an outcome"
                  : action.category === "approval"
                    ? "Inspect the evidence and approve or request changes"
                    : "Respond, delegate, or convert it into owned work"}
              </dd>
            </div>
          </dl>
          {action.category === "mention" && (
            <form className="inbox-response-box" onSubmit={submit}>
              <label>
                <span>Quick response</span>
                <textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  placeholder={`Reply to ${action.source}…`}
                />
              </label>
              <button className="primary-button" disabled={!response.trim()}>
                <Send size={14} /> Record response
              </button>
            </form>
          )}
        </div>
        <footer className="workflow-dialog-actions">
          <button className="secondary-button" onClick={onSnooze}>
            <AlarmClock size={14} /> Snooze
          </button>
          <button className="secondary-button" onClick={onAddToWork}>
            <ListTodo size={14} /> Add to My Work
          </button>
          <div>
            <Link className="secondary-button" href={action.route}>
              Open source <ArrowRight size={13} />
            </Link>
            <button className="primary-button" onClick={onDone}>
              <CheckCircle2 size={14} /> Done
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function SnoozeDialog({
  count,
  onClose,
  onConfirm,
}: {
  count: number;
  onClose: () => void;
  onConfirm: (until: string) => void;
}) {
  const [preset, setPreset] = useState("Tomorrow, 09:00");
  const [custom, setCustom] = useState("");
  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog compact-workflow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snooze-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <AlarmClock size={18} />
          </span>
          <div>
            <p>Pause the notification, not the work</p>
            <h2 id="snooze-dialog-title">
              Snooze {count === 1 ? "this item" : `${count} items`}
            </h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close snooze"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body">
          <div className="snooze-presets">
            {[
              "Later today, 16:00",
              "Tomorrow, 09:00",
              "Next Monday, 09:00",
              "In one week",
            ].map((option) => (
              <button
                key={option}
                className={preset === option ? "selected" : ""}
                onClick={() => {
                  setPreset(option);
                  setCustom("");
                }}
              >
                <AlarmClock size={14} />
                <span>{option}</span>
                <CheckCircle2 size={14} />
              </button>
            ))}
          </div>
          <label className="stacked-field">
            <span>Custom date</span>
            <input
              type="date"
              value={custom}
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
          <p className="workflow-safety-note">
            <TimerReset size={14} /> Snoozed items keep their context and return
            to Needs response at the chosen time.
          </p>
        </div>
        <footer className="workflow-dialog-actions">
          <span>{custom ? `Returns ${custom}` : preset}</span>
          <div>
            <button className="secondary-button" onClick={onClose}>
              Cancel
            </button>
            <button
              className="primary-button"
              onClick={() => onConfirm(custom || preset)}
            >
              <AlarmClock size={14} /> Snooze
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function iconForCategory(category: InboxCategory) {
  if (category === "decision") return <FileQuestion size={15} />;
  if (category === "approval") return <CircleCheckBig size={15} />;
  if (category === "follow-up") return <AlarmClock size={15} />;
  return <MessageSquareText size={15} />;
}

function iconForCapture(type: CapturedWorkType) {
  if (type === "idea") return <Lightbulb size={13} />;
  if (type === "link") return <Link2 size={13} />;
  if (type === "decision") return <FileQuestion size={13} />;
  if (type === "request") return <Send size={13} />;
  if (type === "note") return <MessageSquareText size={13} />;
  return <ListTodo size={13} />;
}

function captureTypeLabel(type: CapturedWorkType) {
  return type[0]!.toUpperCase() + type.slice(1);
}

function captureTitle(value: string, type: CapturedWorkType) {
  if (type === "link") {
    try {
      return new URL(value).hostname.replace("www.", "");
    } catch {
      return value.slice(0, 80);
    }
  }
  return value
    .split("\n")[0]!
    .replace(/^(Idea|Decision):\s*/i, "")
    .slice(0, 100);
}

function dateFromPreset(preset: string) {
  if (preset === "none" || preset === "custom") return "";
  const date = new Date();
  if (preset === "tomorrow") date.setDate(date.getDate() + 1);
  if (preset === "week") date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function initialsFor(name: string) {
  if (name === "TREVV") return "T";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
