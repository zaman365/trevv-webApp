"use client";

import type { BoardDto, WorkItemDto } from "@founderhq/api-contract";
import {
  CheckCircle2,
  ChevronDown,
  Inbox,
  LayoutList,
  Plus,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

type CaptureType = WorkItemDto["type"];
type CapturePriority = WorkItemDto["priority"];

interface LiveCaptureDraft {
  destination: "inbox" | "board";
  boardId: string;
  type: CaptureType;
  title: string;
  description: string;
  priority: CapturePriority;
  dueDate: string;
  attemptedFingerprint: string;
}

export interface LiveCaptureSuccess {
  destination: "inbox" | "board";
  recordId: string;
  title: string;
  workspaceSlug: string;
  routeView: "inbox" | "my-work" | "decisions" | "approvals";
  replayed: boolean;
}

const emptyDraft: LiveCaptureDraft = {
  destination: "inbox",
  boardId: "",
  type: "task",
  title: "",
  description: "",
  priority: "normal",
  dueDate: "",
  attemptedFingerprint: "",
};

export function LiveQuickCaptureDialog({
  workspaceId,
  workspaceSlug,
  onClose,
  onConfirmed,
}: {
  workspaceId: string;
  workspaceSlug: string;
  onClose: () => void;
  onConfirmed: (result: LiveCaptureSuccess) => void;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `quick-capture:${workspaceId}`,
  });
  const [draft, setDraft] = useState<LiveCaptureDraft>(emptyDraft);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [boardsLoading, setBoardsLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let recovered: LiveDraftEnvelope<LiveCaptureDraft> | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isLiveDraftEnvelope(parsed, isCaptureDraft)) {
          recovered = parsed;
        }
      }
    } catch {
      // Draft recovery is best effort; canonical product state remains remote.
    }
    const timer = window.setTimeout(() => {
      if (recovered) {
        setDraft(recovered.payload);
        setIdempotencyKey(recovered.idempotencyKey);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const envelope: LiveDraftEnvelope<LiveCaptureDraft> = {
      version: 1,
      idempotencyKey,
      payload: draft,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      // Submission still works when browser draft storage is unavailable.
    }
  }, [draft, hydrated, idempotencyKey, storageKey]);

  useEffect(() => {
    let active = true;
    liveData.client
      .boards(workspaceId)
      .then((records) => {
        if (!active) return;
        setBoards(records);
        setDraft((current) =>
          current.boardId || current.attemptedFingerprint || !records[0]
            ? current
            : { ...current, boardId: records[0].id },
        );
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setBoardsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [liveData.client, workspaceId]);

  const selectedBoard = useMemo(
    () => boards.find((board) => board.id === draft.boardId) ?? boards[0],
    [boards, draft.boardId],
  );

  function changeDraft(patch: Partial<LiveCaptureDraft>) {
    const next = { ...draft, ...patch };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      captureFingerprint(next) !== draft.attemptedFingerprint;
    setDraft({
      ...next,
      ...(changedAfterAttempt ? { attemptedFingerprint: "" } : {}),
    });
    if (error || changedAfterAttempt) {
      setError(null);
      setRetrying(false);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || !draft.title.trim() || pending) return;
    if (draft.destination === "board" && !selectedBoard) return;
    const normalizedDraft = selectedBoard
      ? { ...draft, boardId: selectedBoard.id }
      : draft;
    const attemptedFingerprint = captureFingerprint(normalizedDraft);
    const attemptedDraft = { ...normalizedDraft, attemptedFingerprint };
    setDraft(attemptedDraft);
    persistDraft(storageKey, attemptedDraft, idempotencyKey);
    setPending(true);
    setRetrying(Boolean(error));
    setError(null);
    try {
      if (attemptedDraft.destination === "inbox") {
        const result = await liveData.client.captureInboxItem(
          {
            category: attemptedDraft.type,
            title: attemptedDraft.title,
            body: attemptedDraft.description,
            resource: {
              suggestedWorkspaceId: workspaceId,
              suggestedBoardId: attemptedDraft.boardId || undefined,
              type: attemptedDraft.type,
              priority: attemptedDraft.priority,
              dueDate: attemptedDraft.dueDate || undefined,
            },
          },
          idempotencyKey,
        );
        await liveData.refresh();
        clearDraft(storageKey);
        onConfirmed({
          destination: "inbox",
          recordId: result.data.id,
          title: result.data.title,
          workspaceSlug,
          routeView: "inbox",
          replayed: result.replayed,
        });
        return;
      }

      const result = await liveData.client.createItem(
        {
          workspaceId,
          boardId: selectedBoard!.id,
          title: attemptedDraft.title,
          description: attemptedDraft.description,
          type: attemptedDraft.type,
          priority: attemptedDraft.priority,
          status: "not_started",
          ...(attemptedDraft.dueDate
            ? { dueDate: attemptedDraft.dueDate }
            : {}),
          assigneeIds: [],
          ...(attemptedDraft.type === "decision"
            ? { decisionState: "needed" }
            : {}),
          ...(attemptedDraft.type === "approval"
            ? { approvalState: "pending" }
            : {}),
        },
        idempotencyKey,
      );
      await liveData.refresh();
      clearDraft(storageKey);
      onConfirmed({
        destination: "board",
        recordId: result.data.id,
        title: result.data.title,
        workspaceSlug,
        routeView:
          attemptedDraft.type === "decision"
            ? "decisions"
            : attemptedDraft.type === "approval"
              ? "approvals"
              : "my-work",
        replayed: result.replayed,
      });
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presentedError = error ? presentLiveError(error) : null;

  return (
    <div
      className={`dialog-layer ${styles.dialogLayer}`}
      role="presentation"
      onMouseDown={onClose}
    >
      <form
        aria-labelledby="live-capture-title"
        aria-modal="true"
        className={`capture-dialog ${styles.captureDialog}`}
        data-testid="live-quick-capture"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span className="attention-icon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <div>
            <h2 id="live-capture-title">Capture work</h2>
            <p>Save to Inbox first, or create a canonical board item now.</p>
          </div>
          <button aria-label="Close capture" onClick={onClose} type="button">
            <X size={17} />
          </button>
        </header>

        <fieldset
          aria-busy={!hydrated || pending}
          className={styles.formBody}
          disabled={!hydrated || pending}
        >
          {presentedError ? (
            <LiveStateNotice
              kind={retrying ? "retrying" : presentedError.kind}
              title={
                retrying
                  ? "Retrying the same safe request"
                  : presentedError.title
              }
              description={presentedError.description}
            />
          ) : pending ? (
            <LiveStateNotice
              kind="pending"
              title="Waiting for server confirmation"
              description="No success is shown until the canonical record is acknowledged."
            />
          ) : null}

          <fieldset className={styles.choiceGrid}>
            <legend>Destination</legend>
            <label>
              <input
                checked={draft.destination === "inbox"}
                name="capture-destination"
                onChange={() => changeDraft({ destination: "inbox" })}
                type="radio"
              />
              <Inbox size={17} />
              <span>
                <strong>Inbox first</strong>
                <small>Organize it into a board when ready.</small>
              </span>
            </label>
            <label>
              <input
                checked={draft.destination === "board"}
                name="capture-destination"
                onChange={() => changeDraft({ destination: "board" })}
                type="radio"
              />
              <LayoutList size={17} />
              <span>
                <strong>Direct to board</strong>
                <small>Create the durable WorkItem immediately.</small>
              </span>
            </label>
          </fieldset>

          <label className={styles.field}>
            <span>Title</span>
            <input
              autoFocus
              data-testid="live-capture-title"
              maxLength={500}
              onChange={(event) => changeDraft({ title: event.target.value })}
              placeholder="What needs to move?"
              required
              value={draft.title}
            />
          </label>

          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Type</span>
              <select
                aria-label="Work type"
                onChange={(event) =>
                  changeDraft({ type: event.target.value as CaptureType })
                }
                value={draft.type}
              >
                {(
                  [
                    "task",
                    "decision",
                    "approval",
                    "milestone",
                    "idea",
                    "request",
                  ] as const
                ).map((type) => (
                  <option key={type} value={type}>
                    {labelFor(type)}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Priority</span>
              <select
                aria-label="Priority"
                onChange={(event) =>
                  changeDraft({
                    priority: event.target.value as CapturePriority,
                  })
                }
                value={draft.priority}
              >
                {(["urgent", "high", "normal", "low", "none"] as const).map(
                  (priority) => (
                    <option key={priority} value={priority}>
                      {labelFor(priority)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Board {draft.destination === "inbox" ? "suggestion" : ""}
              </span>
              <span className={styles.selectShell}>
                <select
                  aria-label="Destination board"
                  disabled={boardsLoading || boards.length === 0}
                  onChange={(event) =>
                    changeDraft({ boardId: event.target.value })
                  }
                  required={draft.destination === "board"}
                  value={selectedBoard?.id ?? ""}
                >
                  {boards.length === 0 ? (
                    <option value="">No board available</option>
                  ) : null}
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </label>
            <label className={styles.field}>
              <span>Due date · Optional</span>
              <input
                onChange={(event) =>
                  changeDraft({ dueDate: event.target.value })
                }
                type="date"
                value={draft.dueDate}
              />
            </label>
          </div>

          <label className={styles.field}>
            <span>Context · Optional</span>
            <textarea
              maxLength={20_000}
              onChange={(event) =>
                changeDraft({ description: event.target.value })
              }
              placeholder="Outcome, constraints, or supporting context"
              rows={4}
              value={draft.description}
            />
          </label>
        </fieldset>

        <footer>
          <span>
            {hydrated
              ? "This recoverable draft is isolated to your account and organization."
              : "Checking for a recoverable draft…"}
          </span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              data-testid="live-capture-submit"
              disabled={
                !hydrated ||
                pending ||
                !draft.title.trim() ||
                (draft.destination === "board" && !selectedBoard)
              }
              type="submit"
            >
              {pending ? (
                "Waiting for confirmation…"
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  {error ? "Retry same request" : "Save capture"}
                </>
              )}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function isCaptureDraft(value: unknown): value is LiveCaptureDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<LiveCaptureDraft>;
  return (
    (draft.destination === "inbox" || draft.destination === "board") &&
    typeof draft.boardId === "string" &&
    ["task", "decision", "approval", "milestone", "idea", "request"].includes(
      draft.type ?? "",
    ) &&
    typeof draft.title === "string" &&
    typeof draft.description === "string" &&
    ["urgent", "high", "normal", "low", "none"].includes(
      draft.priority ?? "",
    ) &&
    typeof draft.dueDate === "string" &&
    typeof draft.attemptedFingerprint === "string"
  );
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The server has already confirmed the canonical record.
  }
}

function persistDraft(
  key: string,
  draft: LiveCaptureDraft,
  idempotencyKey: string,
) {
  const envelope: LiveDraftEnvelope<LiveCaptureDraft> = {
    version: 1,
    idempotencyKey,
    payload: draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // The in-memory draft still remains available for retry.
  }
}

function captureFingerprint(draft: LiveCaptureDraft) {
  return JSON.stringify({
    destination: draft.destination,
    boardId: draft.boardId,
    type: draft.type,
    title: draft.title,
    description: draft.description,
    priority: draft.priority,
    dueDate: draft.dueDate,
  });
}

function labelFor(value: string) {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`;
}
