"use client";

import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleCheckBig,
  ClipboardCheck,
  FileQuestion,
  Inbox,
  Lightbulb,
  ListTodo,
  Milestone,
  Plus,
  Send,
  UserRound,
  X,
} from "lucide-react";
import { demoBoards, demoHubs, type WorkItemType } from "@founderhq/core";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { storeCapturedWork, type CapturedWorkItem } from "@/lib/captured-work";
import { routeForWorkItemType, validateCapture } from "@/lib/workflow-rules";
import { Hint } from "./learning-center";

const createTypes = [
  {
    id: "task",
    label: "Task",
    description: "A concrete next action",
    icon: ListTodo,
  },
  {
    id: "decision",
    label: "Decision",
    description: "A choice that needs an outcome",
    icon: FileQuestion,
  },
  {
    id: "approval",
    label: "Approval",
    description: "Work that needs a reviewer",
    icon: CircleCheckBig,
  },
  {
    id: "milestone",
    label: "Milestone",
    description: "A meaningful checkpoint",
    icon: Milestone,
  },
  {
    id: "idea",
    label: "Idea",
    description: "An opportunity to explore",
    icon: Lightbulb,
  },
  {
    id: "request",
    label: "Request",
    description: "An ask for someone else",
    icon: Send,
  },
] as const;

const currentHubs = demoHubs.filter((hub) => !hub.id.startsWith("original-"));
const owners = [
  "Mohammed Zaman",
  "Nora Klein",
  "Amira Demir",
  "Elias Hart",
  "Jana Roth",
  "Tim Bauer",
];

export function UniversalCreateDialog({
  onClose,
  onCreated,
  availableHubIds,
  defaultHubId,
}: {
  onClose: () => void;
  onCreated: (item: CapturedWorkItem) => void;
  availableHubIds?: readonly string[];
  defaultHubId?: string;
}) {
  const availableHubs = availableHubIds
    ? currentHubs.filter((hub) => availableHubIds.includes(hub.id))
    : currentHubs;
  const [type, setType] = useState<WorkItemType>("task");
  const [title, setTitle] = useState("");
  const [hubId, setHubId] = useState(
    availableHubs.some((hub) => hub.id === defaultHubId)
      ? (defaultHubId ?? "")
      : (availableHubs[0]?.id ?? ""),
  );
  const boards = useMemo(
    () =>
      demoBoards.filter(
        (board) => board.hubId === hubId && !board.id.startsWith("original-"),
      ),
    [hubId],
  );
  const [boardId, setBoardId] = useState("");
  const [owner, setOwner] = useState("Mohammed Zaman");
  const [priority, setPriority] =
    useState<CapturedWorkItem["priority"]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [details, setDetails] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [sendToInbox, setSendToInbox] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const selectedType = createTypes.find((candidate) => candidate.id === type)!;
  const SelectedTypeIcon = selectedType.icon;
  const needsDate = type === "milestone" || type === "approval";
  const effectiveBoardId = boards.some((board) => board.id === boardId)
    ? boardId
    : (boards[0]?.id ?? "inbox");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      validateCapture({ type, title, ...(dueDate ? { dueDate } : {}) }).length
    )
      return;
    const item: CapturedWorkItem = {
      id: `capture-${Date.now()}`,
      type,
      title: title.trim(),
      hubId,
      boardId: effectiveBoardId,
      owner,
      priority,
      ...(dueDate ? { dueDate } : {}),
      ...(details.trim() ? { details: details.trim() } : {}),
      ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
      createdAt: new Date().toISOString(),
      sendToInbox,
    };
    storeCapturedWork(item);
    onCreated(item);
  };

  const handleShortcut = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  };

  return (
    <div
      className="dialog-layer universal-create-layer"
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        className="capture-dialog universal-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="universal-create-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={handleShortcut}
        onSubmit={submit}
      >
        <header className="universal-create-header">
          <span className="attention-icon">
            <Plus size={18} />
          </span>
          <div>
            <h2 id="universal-create-title">Create in TREVV</h2>
            <p>Capture the work once, with enough context to move.</p>
          </div>
          <Hint resourceId="quick-capture" />
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close Create"
          >
            <X size={18} />
          </button>
        </header>

        <div className="create-dialog-scroll">
          <fieldset className="create-type-grid">
            <legend>What are you creating?</legend>
            {createTypes.map(({ id, label, description, icon: Icon }) => (
              <label key={id} className={type === id ? "selected" : ""}>
                <input
                  type="radio"
                  name="create-type"
                  value={id}
                  checked={type === id}
                  onChange={() => {
                    setType(id);
                    setDueDate((current) =>
                      id === "approval" || id === "milestone"
                        ? current || "2026-09-10"
                        : "",
                    );
                  }}
                />
                <span>
                  <Icon size={16} />
                </span>
                <div>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </div>
                <i>
                  <CheckCircle2 size={13} />
                </i>
              </label>
            ))}
          </fieldset>

          <label className="create-title-field">
            <span>{titleLabel(type)}</span>
            <input
              autoFocus
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={titlePlaceholder(type)}
            />
          </label>

          <div className="create-core-fields">
            <label>
              <span>Project</span>
              <div>
                <span>{availableHubs.find((hub) => hub.id === hubId)?.icon}</span>
                <select
                  value={hubId}
                  onChange={(event) => {
                    setHubId(event.target.value);
                    setBoardId("");
                  }}
                >
                  {availableHubs.map((hub) => (
                    <option key={hub.id} value={hub.id}>
                      {hub.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
            </label>
            <label>
              <span>Board</span>
              <div>
                <ClipboardCheck size={14} />
                <select
                  value={effectiveBoardId}
                  onChange={(event) => setBoardId(event.target.value)}
                >
                  {boards.length ? (
                    boards.map((board) => (
                      <option key={board.id} value={board.id}>
                        {board.name}
                      </option>
                    ))
                  ) : (
                    <option value="inbox">Inbox / organize later</option>
                  )}
                </select>
                <ChevronDown size={13} />
              </div>
            </label>
            <label>
              <span>
                {type === "approval"
                  ? "Reviewer"
                  : type === "request"
                    ? "Requested from"
                    : "Owner"}
              </span>
              <div>
                <UserRound size={14} />
                <select
                  value={owner}
                  onChange={(event) => setOwner(event.target.value)}
                >
                  {owners.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <ChevronDown size={13} />
              </div>
            </label>
          </div>

          <button
            type="button"
            className="create-details-toggle"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((current) => !current)}
          >
            <Plus size={14} />{" "}
            {showDetails
              ? "Hide details"
              : "Add priority, date, context, or evidence"}
          </button>

          {(showDetails || needsDate) && (
            <section className="create-more-details">
              <div className="form-grid-two">
                <label className="stacked-field">
                  <span>Priority</span>
                  <select
                    value={priority}
                    onChange={(event) =>
                      setPriority(
                        event.target.value as CapturedWorkItem["priority"],
                      )
                    }
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </label>
                <label className="stacked-field">
                  <span>Due date {needsDate ? "" : "· Optional"}</span>
                  <input
                    type="date"
                    required={needsDate}
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
              </div>
              <label className="stacked-field">
                <span>{detailLabel(type)}</span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  placeholder={detailPlaceholder(type)}
                />
              </label>
              <label className="stacked-field">
                <span>
                  Evidence or source link <small>Optional</small>
                </span>
                <input
                  type="url"
                  value={evidenceUrl}
                  onChange={(event) => setEvidenceUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
            </section>
          )}

          <label className="create-inbox-option">
            <input
              type="checkbox"
              checked={sendToInbox}
              onChange={(event) => setSendToInbox(event.target.checked)}
            />
            <span>
              <Inbox size={15} />
            </span>
            <div>
              <strong>Also add to my Inbox</strong>
              <small>
                Useful when you want to organize or revisit this capture
                yourself.
              </small>
            </div>
          </label>
        </div>

        <footer>
          <span>
            <CalendarClock size={13} /> ⌘ + Enter to create
          </span>
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
              disabled={!title.trim() || (needsDate && !dueDate)}
            >
              <SelectedTypeIcon size={14} /> Create{" "}
              {selectedType.label.toLocaleLowerCase()}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

export function routeForCapturedType(type: CapturedWorkItem["type"]) {
  if (type === "note" || type === "link") return "/app/inbox";
  return routeForWorkItemType(type);
}

function titleLabel(type: WorkItemType) {
  if (type === "decision") return "Decision question";
  if (type === "idea") return "Idea or opportunity";
  if (type === "approval") return "What needs approval?";
  if (type === "milestone") return "Milestone name";
  if (type === "request") return "What are you requesting?";
  return "Task title";
}

function titlePlaceholder(type: WorkItemType) {
  if (type === "decision") return "Which path should we choose?";
  if (type === "idea") return "What opportunity did you notice?";
  if (type === "approval") return "Name the work to review";
  if (type === "milestone") return "Name the meaningful checkpoint";
  if (type === "request") return "Describe the ask clearly";
  return "What needs to move?";
}

function detailLabel(type: WorkItemType) {
  if (type === "decision") return "Context and initial recommendation";
  if (type === "idea") return "Problem, hypothesis, or observation";
  if (type === "approval") return "Review criteria";
  if (type === "request") return "Expected outcome";
  return "Description or completion notes";
}

function detailPlaceholder(type: WorkItemType) {
  if (type === "decision")
    return "Why now, what are the options, and what currently looks strongest?";
  if (type === "idea")
    return "What did you observe and what do you think might improve it?";
  if (type === "approval")
    return "What should the reviewer check before approving?";
  return "Add the context someone needs to complete this without another meeting…";
}
