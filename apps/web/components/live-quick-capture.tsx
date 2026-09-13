"use client";
import { PlanningPeopleFields } from "./planning-people-fields";
import {
  emptyPeopleChoice,
  usePlanningSharing,
  type PeopleChoice,
} from "@/lib/planning-sharing";

import {
  workItemPlanningSchema,
  type BoardDto,
  type WorkItemDto,
} from "@founderhq/api-contract";
import { CheckCircle2, Inbox, LayoutList, Plus, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import { planningForBoard } from "@/lib/task-planning";
import {
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import { LiveTaskPlanningFields } from "./live-task-planning-fields";
import { LiveAssigneeField } from "./live-assignee-field";
import { useQueryClient } from "@tanstack/react-query";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { applyConfirmedInboxItem } from "@/lib/live-app-mutations";
import styles from "./live-operating-loop.module.css";
import { captureTypes, QuickCaptureTypes } from "./quick-capture-types";

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
  assigneeId?: string;
  attemptedFingerprint: string;
  planning?: WorkItemDto["planning"];
  people?: PeopleChoice;
}

export interface LiveCaptureSuccess {
  destination: "inbox" | "board";
  recordId: string;
  title: string;
  workspaceSlug: string;
  routeView: "inbox" | "my-work" | "decisions" | "approvals";
  replayed: boolean;
  boardId?: string;
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
  defaultDestination = "board",
  defaultAssigneeId = "",
  defaultTeamId,
  defaultBoardId,
  defaultType = "task",
  returnFocusRef,
  embedded = false,
  draftScope,
  initialTitle = "",
  initialDescription = "",
}: {
  workspaceId: string;
  workspaceSlug: string;
  onClose: () => void;
  onConfirmed: (result: LiveCaptureSuccess) => void;
  defaultDestination?: "inbox" | "board";
  defaultAssigneeId?: string;
  defaultTeamId?: string;
  defaultBoardId?: string;
  defaultType?: CaptureType;
  returnFocusRef?: RefObject<HTMLElement | null>;
  embedded?: boolean;
  draftScope?: string;
  initialTitle?: string;
  initialDescription?: string;
}) {
  const session = useAppSession();
  const shareResource = usePlanningSharing();
  const queryClient = useQueryClient();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope:
      draftScope ??
      (defaultTeamId
        ? `team-capture:${workspaceId}:${defaultTeamId}`
        : `quick-capture:${workspaceId}`),
  });
  const dialogRef = useAccessibleDialog<HTMLFormElement>(
    onClose,
    returnFocusRef,
    !embedded,
  );
  const [draft, setDraft] = useState<LiveCaptureDraft>(() => ({
    ...emptyDraft,
    destination: defaultDestination,
    assigneeId: defaultAssigneeId,
    boardId: defaultBoardId ?? "",
    type: defaultType,
    title: initialTitle,
    description: initialDescription,
    ...(defaultTeamId ? { planning: { teamId: defaultTeamId } } : {}),
  }));
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
      if (
        recovered &&
        (recovered.payload.title.trim() ||
          recovered.payload.description.trim() ||
          recovered.payload.attemptedFingerprint)
      ) {
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
        const scopedRecords = defaultTeamId
          ? records.filter(
              (board) =>
                !board.planning?.teamId ||
                board.planning.teamId === defaultTeamId,
            )
          : records;
        setBoards(scopedRecords);
        setDraft((current) =>
          current.boardId || current.attemptedFingerprint || !scopedRecords[0]
            ? current
            : {
                ...current,
                boardId: (
                  scopedRecords.find(
                    (board) => board.planning?.teamId === defaultTeamId,
                  ) ?? scopedRecords[0]
                ).id,
              },
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
  }, [liveData.client, workspaceId, defaultTeamId]);

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
    if (
      draft.type === "idea" &&
      draft.destination === "board" &&
      draft.people?.enabled &&
      !draft.people.participantIds.length
    )
      return;
    if (draft.destination === "board" && !selectedBoard) return;
    const normalizedDraft = selectedBoard
      ? {
          ...draft,
          boardId: selectedBoard.id,
          planning: planningForBoard(selectedBoard, draft.planning),
        }
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
              assigneeId: attemptedDraft.assigneeId || undefined,
              planning: attemptedDraft.planning,
            },
          },
          idempotencyKey,
        );
        await applyConfirmedInboxItem(
          queryClient,
          session.organization.id,
          result.data,
        );
        void queryClient.invalidateQueries({
          queryKey: workspaceResourceKeys.inbox(session.organization.id),
        });
        void liveData.refresh();
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
          boardId: selectedBoard!.planning?.parentBoardId ?? selectedBoard!.id,
          planning: attemptedDraft.planning,
          title: attemptedDraft.title,
          description: attemptedDraft.description,
          type: attemptedDraft.type,
          priority: attemptedDraft.priority,
          status: "not_started",
          ...(attemptedDraft.dueDate
            ? { dueDate: attemptedDraft.dueDate }
            : {}),
          assigneeIds: attemptedDraft.assigneeId
            ? [attemptedDraft.assigneeId]
            : [],
          ...(attemptedDraft.type === "decision"
            ? { decisionState: "needed" }
            : {}),
          ...(attemptedDraft.type === "approval"
            ? { approvalState: "pending" }
            : {}),
        },
        idempotencyKey,
      );
      if (attemptedDraft.type === "idea")
        shareResource(
          {
            entityType: "work_item",
            entityId: result.data.id,
            title: result.data.title,
            description: result.data.description,
            workspaceId,
          },
          attemptedDraft.people ?? emptyPeopleChoice,
          idempotencyKey,
        );
      await liveData.applyConfirmedItem(result.data);
      void liveData.refresh();
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
        boardId: result.data.boardId,
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
      className={
        embedded ? styles.embeddedDetail : `dialog-layer ${styles.dialogLayer}`
      }
      role="presentation"
      onMouseDown={embedded ? undefined : onClose}
    >
      <form
        aria-labelledby="live-capture-title"
        aria-modal={embedded ? undefined : true}
        className={
          embedded
            ? styles.embeddedCapture
            : `capture-dialog ${styles.captureDialog}`
        }
        data-testid="live-quick-capture"
        ref={dialogRef}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role={embedded ? "region" : "dialog"}
      >
        <header>
          <span className="attention-icon" aria-hidden="true">
            <Plus size={18} />
          </span>
          <div>
            <h2 id="live-capture-title">Quick capture</h2>
            <p>
              Capture work, an idea or a request. Organize it now or save it for
              later.
            </p>
          </div>
          {!embedded ? (
            <button aria-label="Close capture" onClick={onClose} type="button">
              <X size={17} />
            </button>
          ) : null}
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
              description={`Saving your ${draft.type} and its details.`}
            />
          ) : null}

          <QuickCaptureTypes
            value={draft.type}
            onChange={(type) => changeDraft({ type })}
          >
            <details open={draft.destination === "inbox"}>
              <summary>Optional: save to Inbox for later</summary>
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
                    <small>Assign and track this work immediately.</small>
                  </span>
                </label>
              </fieldset>
            </details>

            <label className={styles.field}>
              <span>Title</span>
              <input
                autoFocus
                data-testid="live-capture-title"
                maxLength={500}
                onChange={(event) => changeDraft({ title: event.target.value })}
                placeholder={captureTypes[draft.type].placeholder}
                required
                value={draft.title}
              />
            </label>

            <div className={styles.formGrid}>
              <label className={`${styles.field} ${styles.captureBoardField}`}>
                <span>
                  Board {draft.destination === "inbox" ? "suggestion" : ""}
                </span>
                <span className={styles.selectShell}>
                  <select
                    aria-label="Destination board"
                    disabled={boardsLoading || boards.length === 0}
                    onChange={(event) => {
                      const nextBoard = boards.find(
                        (board) => board.id === event.target.value,
                      );
                      if (nextBoard)
                        changeDraft({
                          people: {
                            ...(draft.people ?? emptyPeopleChoice),
                            participantIds: [],
                          },
                          boardId: nextBoard.id,
                          planning: {
                            ...(defaultTeamId ? { teamId: defaultTeamId } : {}),
                            ...planningForBoard(
                              nextBoard,
                              draft.planning,
                              selectedBoard,
                            ),
                          },
                        });
                    }}
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
                </span>
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

            <LiveAssigneeField
              workspaceId={workspaceId}
              value={draft.assigneeId ?? ""}
              onChange={(assigneeId) => changeDraft({ assigneeId })}
            />
            {draft.destination === "board" && selectedBoard ? (
              <LiveTaskPlanningFields
                workspaceId={workspaceId}
                boardId={selectedBoard.id}
                value={
                  draft.planning ?? {
                    ...(selectedBoard.planning?.teamId
                      ? { teamId: selectedBoard.planning.teamId }
                      : {}),
                    ...(selectedBoard.planning?.parentBoardId
                      ? { cycleId: selectedBoard.id }
                      : {}),
                  }
                }
                onChange={(planning) =>
                  changeDraft({
                    planning,
                    ...(planning.teamId !== draft.planning?.teamId
                      ? {
                          people: {
                            ...(draft.people ?? emptyPeopleChoice),
                            participantIds: [],
                          },
                        }
                      : {}),
                  })
                }
              />
            ) : null}
            {draft.destination === "inbox" && draft.assigneeId ? (
              <small>
                The assignee will be applied when this capture becomes a board
                item.
              </small>
            ) : null}

            {draft.type === "idea" ? (
              draft.destination === "board" ? (
                <PlanningPeopleFields
                  workspaceId={workspaceId}
                  teamId={
                    draft.planning?.teamId ??
                    selectedBoard?.planning?.teamId ??
                    ""
                  }
                  onTeamChange={(teamId) =>
                    changeDraft({
                      people: {
                        ...(draft.people ?? emptyPeopleChoice),
                        participantIds: [],
                      },
                      planning: {
                        ...draft.planning,
                        teamId: teamId || undefined,
                      },
                    })
                  }
                  value={draft.people ?? emptyPeopleChoice}
                  onChange={(people) => changeDraft({ people })}
                />
              ) : (
                <p>
                  Inbox keeps this capture for later. Choose Direct to board to
                  invite collaborators and start a shared discussion now.
                </p>
              )
            ) : null}

            <label className={styles.field}>
              <span>Context · Optional</span>
              <textarea
                aria-label="Context · Optional"
                maxLength={20_000}
                onChange={(event) =>
                  changeDraft({ description: event.target.value })
                }
                placeholder="Outcome, constraints, or supporting context"
                rows={4}
                value={draft.description}
              />
            </label>
          </QuickCaptureTypes>
        </fieldset>

        <footer>
          <span>
            {hydrated
              ? "Your draft is saved on this device."
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
                (draft.type === "idea" &&
                  draft.destination === "board" &&
                  Boolean(draft.people?.enabled) &&
                  !draft.people?.participantIds.length) ||
                (draft.destination === "board" && !selectedBoard)
              }
              type="submit"
            >
              {pending ? (
                "Waiting for confirmation…"
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  {error
                    ? "Retry save"
                    : draft.destination === "board"
                      ? `Create ${draft.type}`
                      : "Save to Inbox"}
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
    (draft.assigneeId === undefined || typeof draft.assigneeId === "string") &&
    (draft.planning === undefined ||
      workItemPlanningSchema.safeParse(draft.planning).success) &&
    (draft.people === undefined ||
      (typeof draft.people.enabled === "boolean" &&
        typeof draft.people.note === "string" &&
        draft.people.note.length <= 2000 &&
        Array.isArray(draft.people.participantIds) &&
        draft.people.participantIds.length <= 249 &&
        draft.people.participantIds.every(
          (id) => typeof id === "string" && id.length <= 128,
        ))) &&
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
    ...(draft.assigneeId ? { assigneeId: draft.assigneeId } : {}),
    ...(draft.planning ? { planning: draft.planning } : {}),
  });
}

function labelFor(value: string) {
  return `${value.slice(0, 1).toLocaleUpperCase()}${value.slice(1)}`;
}
