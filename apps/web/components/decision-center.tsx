"use client";

import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  FileQuestion,
  Filter,
  History,
  Link2,
  MessageSquareText,
  Pause,
  Plus,
  Search,
  Send,
  UserRoundCog,
  X,
} from "lucide-react";
import { demoHubs, demoItems } from "@founderhq/core";
import { useMemo, useState, type FormEvent } from "react";
import { useCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { useWorkspace } from "@/lib/workspace-context";
import { Hint } from "./learning-center";

type DecisionState =
  "needed" | "analyzing" | "delegated" | "deferred" | "decided";

interface DecisionRecord {
  id: string;
  hubId: string;
  boardId: string;
  title: string;
  question: string;
  context: string;
  recommendation: string;
  options: string[];
  owner: string;
  dueDate: string;
  impact: "urgent" | "high" | "normal";
  state: DecisionState;
  evidence: string[];
  notes: string[];
  outcome?: string | null;
}

const stateLabels: Record<DecisionState, string> = {
  needed: "Needs decision",
  analyzing: "Analyzing",
  delegated: "Delegated",
  deferred: "Deferred",
  decided: "Decided history",
};

const decisionStates = Object.keys(stateLabels) as DecisionState[];

const seededDecisions: DecisionRecord[] = demoItems
  .filter(
    (item) => item.type === "decision" && !item.id.startsWith("original-"),
  )
  .map((item, index) => {
    const state: DecisionState =
      item.decisionState === "decided"
        ? "decided"
        : (["needed", "needed", "analyzing", "delegated", "deferred"] as const)[
            index % 5
          ]!;
    const isNavigation = item.title.toLowerCase().includes("navigation");
    const isOffer = item.title.toLowerCase().includes("offer");
    const options = isNavigation
      ? ["Service-first home", "Task-first home", "Role-based home"]
      : isOffer
        ? ["Early-access bundle", "Launch discount", "Free exchange only"]
        : [
            "Proceed as proposed",
            "Run a smaller pilot",
            "Pause and gather evidence",
          ];

    return {
      id: item.id,
      hubId: item.hubId,
      boardId: item.boardId,
      title: item.title,
      question: `Which path should we choose for ${item.title.toLowerCase()}?`,
      context:
        "This choice blocks the next milestone. The team needs a clear outcome, owner, and rationale before work can continue.",
      recommendation: isNavigation
        ? "Choose the service-first home and validate it with the pilot group."
        : isOffer
          ? "Use the early-access bundle with a simple exchange promise."
          : "Run the smallest reversible version and review evidence after one cycle.",
      options,
      owner: item.assignee ?? "Mohammed Zaman",
      dueDate: item.dueDate ?? "2026-09-04",
      impact:
        item.priority === "urgent"
          ? "urgent"
          : item.priority === "high"
            ? "high"
            : "normal",
      state,
      evidence:
        index % 2 ? ["Pilot interview summary"] : ["Launch readiness note"],
      notes:
        index === 2 ? ["Confirm the operational owner before deciding."] : [],
      ...(state === "decided" ? { outcome: options[1] } : {}),
    };
  });

export function DecisionCenter() {
  const capturedWork = useCapturedWork();
  const { scope } = useWorkspace();
  const [decisions, setDecisions] = useState(seededDecisions);
  const [activeState, setActiveState] = useState<DecisionState>("needed");
  const [query, setQuery] = useState("");
  const [hubId, setHubId] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const capturedDecisions = useMemo(
    () =>
      capturedWork
        .filter((item) => item.type === "decision")
        .map(capturedDecisionRecord),
    [capturedWork],
  );
  const allDecisions = useMemo(
    () => [
      ...decisions,
      ...capturedDecisions.filter(
        (captured) =>
          !decisions.some((decision) => decision.id === captured.id),
      ),
    ],
    [capturedDecisions, decisions],
  );
  const scopedDecisionIds = new Set(scope.hubs.map((project) => project.id));
  const scopedDecisions = allDecisions.filter((decision) =>
    scopedDecisionIds.has(decision.hubId),
  );

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return scopedDecisions.filter((decision) => {
      if (decision.state !== activeState) return false;
      if (hubId !== "all" && decision.hubId !== hubId) return false;
      return (
        !normalized ||
        `${decision.title} ${decision.question} ${decision.owner}`
          .toLocaleLowerCase()
          .includes(normalized)
      );
    });
  }, [activeState, hubId, query, scopedDecisions]);

  const selected = scopedDecisions.find(
    (decision) => decision.id === selectedId,
  );
  const updateDecision = (id: string, update: Partial<DecisionRecord>) => {
    setDecisions((current) => {
      if (current.some((decision) => decision.id === id)) {
        return current.map((decision) =>
          decision.id === id ? { ...decision, ...update } : decision,
        );
      }
      const source = scopedDecisions.find((decision) => decision.id === id);
      return source ? [{ ...source, ...update }, ...current] : current;
    });
  };

  return (
    <div className="decision-center-complete">
      {notice && (
        <div className="workflow-toast" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="workflow-command-bar">
        <label className="workflow-search">
          <Search size={15} />
          <span className="sr-only">Search decisions</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search decisions…"
          />
        </label>
        {scope.hubs.length > 1 && (
          <label className="workflow-filter-select">
            <Filter size={14} />
            <span className="sr-only">Filter by workspace</span>
            <select
              value={hubId}
              onChange={(event) => setHubId(event.target.value)}
            >
              <option value="all">All workspaces</option>
              {scope.hubs.map((hub) => (
                <option key={hub.id} value={hub.id}>
                  {hub.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button className="primary-button" onClick={() => setCreateOpen(true)}>
          <Plus size={15} /> New decision
        </button>
      </div>

      <div className="center-tabs" role="tablist" aria-label="Decision states">
        {decisionStates.map((state) => {
          const count = scopedDecisions.filter(
            (decision) => decision.state === state,
          ).length;
          return (
            <button
              key={state}
              role="tab"
              aria-selected={activeState === state}
              className={activeState === state ? "active" : ""}
              onClick={() => setActiveState(state)}
            >
              {stateLabels[state]} <b>{count}</b>
            </button>
          );
        })}
      </div>

      <div className="center-grid">
        {visible.map((decision) => {
          const hub = demoHubs.find(
            (candidate) => candidate.id === decision.hubId,
          );
          return (
            <article className="decision-card" key={decision.id}>
              <header>
                <span className="decision-icon">
                  <FileQuestion size={16} />
                </span>
                <span className={`impact impact-${decision.impact}`}>
                  {decision.impact === "normal"
                    ? "Normal impact"
                    : `${decision.impact} impact`}
                </span>
              </header>
              <p>
                {hub?.name ?? "No workspace"} /{" "}
                {decision.boardId.replaceAll("-", " ")}
              </p>
              <h2>{decision.title}</h2>
              <span>{decision.question}</span>
              <div className="recommendation">
                <b>
                  {decision.state === "decided" ? "Outcome" : "Recommendation"}
                </b>
                <p>{decision.outcome ?? decision.recommendation}</p>
              </div>
              <div className="decision-card-meta">
                <span>
                  <Link2 size={12} /> {decision.evidence.length} evidence
                </span>
                <span>
                  <MessageSquareText size={12} /> {decision.notes.length} notes
                </span>
              </div>
              <footer>
                <span>
                  <Clock3 size={13} /> Due {decision.dueDate}
                </span>
                <span className="avatar avatar-mz">
                  {initialsFor(decision.owner)}
                </span>
                <button onClick={() => setSelectedId(decision.id)}>
                  {decision.state === "decided"
                    ? "Review outcome"
                    : "Review decision"}
                  <ArrowRight size={13} />
                </button>
              </footer>
            </article>
          );
        })}
      </div>

      {!visible.length && (
        <section className="workflow-empty-state">
          <CheckCircle2 size={24} />
          <h2>No decisions in this view</h2>
          <p>
            Change the filters or create a decision to keep the rationale
            visible.
          </p>
          <button
            className="primary-button"
            onClick={() => setCreateOpen(true)}
          >
            <Plus size={15} /> New decision
          </button>
        </section>
      )}

      {selected && (
        <DecisionDialog
          decision={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={(update, message) => {
            updateDecision(selected.id, update);
            setNotice(message);
          }}
        />
      )}
      {createOpen && (
        <CreateDecisionDialog
          projects={scope.hubs}
          onClose={() => setCreateOpen(false)}
          onCreate={(decision) => {
            setDecisions((current) => [decision, ...current]);
            setActiveState("needed");
            setCreateOpen(false);
            setSelectedId(decision.id);
            setNotice("Decision created and added to Needs decision.");
          }}
        />
      )}
    </div>
  );
}

function DecisionDialog({
  decision,
  onClose,
  onUpdate,
}: {
  decision: DecisionRecord;
  onClose: () => void;
  onUpdate: (update: Partial<DecisionRecord>, message: string) => void;
}) {
  const [option, setOption] = useState(decision.outcome ?? "");
  const [delegate, setDelegate] = useState("Nora Klein");
  const [deferDate, setDeferDate] = useState("2026-09-08");
  const [evidence, setEvidence] = useState("");
  const [note, setNote] = useState("");
  const hub = demoHubs.find((candidate) => candidate.id === decision.hubId);

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        className="workflow-dialog decision-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="decision-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="dialog-title-icon">
            <FileQuestion size={18} />
          </span>
          <div>
            <p>
              {hub?.name ?? "No workspace"} · {stateLabels[decision.state]}
            </p>
            <h2 id="decision-dialog-title">{decision.title}</h2>
          </div>
          <Hint resourceId="decisions" />
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close decision review"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body decision-review-body">
          <section className="decision-question-block">
            <b>Decision question</b>
            <p>{decision.question}</p>
            <small>{decision.context}</small>
          </section>

          <div className="decision-review-columns">
            <section>
              <h3>Options</h3>
              <div className="decision-options">
                {decision.options.map((candidate) => (
                  <label
                    key={candidate}
                    className={option === candidate ? "selected" : ""}
                  >
                    <input
                      type="radio"
                      name="decision-option"
                      checked={option === candidate}
                      onChange={() => setOption(candidate)}
                    />
                    <span>
                      <Check size={14} />
                    </span>
                    <div>
                      <strong>{candidate}</strong>
                      <small>Review impact, reversibility, and evidence.</small>
                    </div>
                  </label>
                ))}
              </div>
              <div className="decision-recommendation-block">
                <b>Recommendation</b>
                <p>{decision.recommendation}</p>
              </div>
            </section>
            <aside>
              <h3>Decision record</h3>
              <dl className="decision-record-list">
                <div>
                  <dt>Owner</dt>
                  <dd>{decision.owner}</dd>
                </div>
                <div>
                  <dt>Due</dt>
                  <dd>{decision.dueDate}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>{decision.impact}</dd>
                </div>
              </dl>
              <label className="stacked-field">
                <span>Add evidence</span>
                <div className="inline-field-action">
                  <input
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                    placeholder="Link or evidence title"
                  />
                  <button
                    disabled={!evidence.trim()}
                    onClick={() => {
                      onUpdate(
                        { evidence: [...decision.evidence, evidence.trim()] },
                        "Evidence attached to the decision.",
                      );
                      setEvidence("");
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </label>
              <ul className="decision-evidence-list">
                {decision.evidence.map((item) => (
                  <li key={item}>
                    <Link2 size={12} /> {item}
                  </li>
                ))}
              </ul>
              <label className="stacked-field">
                <span>Add rationale note</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Capture reasoning or a dissenting view…"
                />
              </label>
              <button
                className="secondary-button full-width"
                disabled={!note.trim()}
                onClick={() => {
                  onUpdate(
                    { notes: [...decision.notes, note.trim()] },
                    "Rationale note added.",
                  );
                  setNote("");
                }}
              >
                <MessageSquareText size={14} /> Add note
              </button>
            </aside>
          </div>

          <section className="decision-secondary-actions">
            <button
              onClick={() =>
                onUpdate({ state: "analyzing" }, "Decision moved to Analyzing.")
              }
            >
              <History size={14} /> Start analysis
            </button>
            <label>
              <UserRoundCog size={14} />
              <select
                value={delegate}
                onChange={(event) => setDelegate(event.target.value)}
              >
                <option>Nora Klein</option>
                <option>Amira Demir</option>
                <option>Elias Hart</option>
              </select>
            </label>
            <button
              onClick={() =>
                onUpdate(
                  { state: "delegated", owner: delegate },
                  `Decision delegated to ${delegate}.`,
                )
              }
            >
              <Send size={14} /> Delegate
            </button>
            <label>
              <CalendarClock size={14} />
              <input
                type="date"
                value={deferDate}
                onChange={(event) => setDeferDate(event.target.value)}
              />
            </label>
            <button
              onClick={() =>
                onUpdate(
                  { state: "deferred", dueDate: deferDate },
                  `Decision deferred until ${deferDate}.`,
                )
              }
            >
              <Pause size={14} /> Defer
            </button>
          </section>
        </div>
        <footer className="workflow-dialog-actions">
          <span>
            {decision.state === "decided"
              ? `Recorded outcome: ${decision.outcome}`
              : "The chosen option and rationale will stay in the decision history."}
          </span>
          <div>
            <button className="secondary-button" onClick={onClose}>
              Close
            </button>
            {decision.state === "decided" ? (
              <button
                className="primary-button"
                onClick={() =>
                  onUpdate(
                    { state: "analyzing", outcome: null },
                    "Decision reopened for analysis.",
                  )
                }
              >
                <History size={14} /> Reopen
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={!option}
                onClick={() =>
                  onUpdate(
                    { state: "decided", outcome: option },
                    `Decision recorded: ${option}.`,
                  )
                }
              >
                <CheckCircle2 size={14} /> Record decision
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function CreateDecisionDialog({
  onClose,
  onCreate,
  projects,
}: {
  onClose: () => void;
  onCreate: (decision: DecisionRecord) => void;
  projects: typeof demoHubs;
}) {
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [hubId, setHubId] = useState(projects[0]?.id ?? "");
  const [dueDate, setDueDate] = useState("2026-09-04");
  const [recommendation, setRecommendation] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !question.trim()) return;
    onCreate({
      id: `decision-${Date.now()}`,
      hubId,
      boardId: "new-decision",
      title: title.trim(),
      question: question.trim(),
      context:
        "Newly captured decision. Add evidence and rationale during review.",
      recommendation:
        recommendation.trim() || "No recommendation recorded yet.",
      options: ["Proceed", "Run a smaller test", "Pause"],
      owner: "Mohammed Zaman",
      dueDate,
      impact: "high",
      state: "needed",
      evidence: [],
      notes: [],
    });
  };

  return (
    <div
      className="workflow-dialog-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="workflow-dialog compact-workflow-dialog"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-decision-title"
      >
        <header>
          <span className="dialog-title-icon">
            <Plus size={18} />
          </span>
          <div>
            <p>Decision Center</p>
            <h2 id="new-decision-title">Create a decision</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close new decision"
          >
            <X size={18} />
          </button>
        </header>
        <div className="workflow-dialog-body form-stack">
          <label className="stacked-field">
            <span>Title</span>
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What choice needs to be made?"
            />
          </label>
          <label className="stacked-field">
            <span>Decision question</span>
            <textarea
              required
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="State the choice as one clear question…"
            />
          </label>
          <div className="form-grid-two">
            <label className="stacked-field">
              <span>Project</span>
              <select
                value={hubId}
                onChange={(event) => setHubId(event.target.value)}
              >
                {projects.map((hub) => (
                  <option key={hub.id} value={hub.id}>
                    {hub.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="stacked-field">
              <span>Due date</span>
              <input
                type="date"
                required
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
          </div>
          <label className="stacked-field">
            <span>
              Initial recommendation <small>Optional</small>
            </span>
            <textarea
              value={recommendation}
              onChange={(event) => setRecommendation(event.target.value)}
              placeholder="What path currently looks strongest, and why?"
            />
          </label>
        </div>
        <footer className="workflow-dialog-actions">
          <span>Options and evidence can be added during review.</span>
          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!title.trim() || !question.trim()}
            >
              <FileQuestion size={14} /> Create decision
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function capturedDecisionRecord(item: CapturedWorkItem): DecisionRecord {
  return {
    id: item.id,
    hubId: item.hubId,
    boardId: item.boardId,
    title: item.title,
    question: item.title.endsWith("?") ? item.title : `${item.title}?`,
    context:
      item.details ??
      "Captured from Create. Add context, options, and evidence during review.",
    recommendation: item.details ?? "No initial recommendation recorded yet.",
    options: ["Proceed", "Run a smaller test", "Pause and gather evidence"],
    owner: item.owner,
    dueDate: item.dueDate ?? "No date",
    impact:
      item.priority === "urgent"
        ? "urgent"
        : item.priority === "high"
          ? "high"
          : "normal",
    state: "needed",
    evidence: item.evidenceUrl ? [item.evidenceUrl] : [],
    notes: [],
  };
}

function initialsFor(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
