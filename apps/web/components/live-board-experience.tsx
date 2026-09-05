"use client";

import { dateTimeFormatter } from "@/lib/date-format";

import type {
  BoardDto,
  WorkItemDto,
  WorkItemEvidenceDto,
  WorkItemHistoryEntryDto,
} from "@founderhq/api-contract";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  History,
  Link2,
  Plus,
  UserPlus,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  formatLiveDate,
  formatLiveDateOnly,
  workItemStatusLabel,
} from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice, LiveSyncedAt } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-operating-loop.module.css";

type ItemPatch = Parameters<
  ReturnType<typeof useLiveAppData>["client"]["updateItem"]
>[1];

interface ConflictState {
  itemId: string;
  patch: ItemPatch;
  error: unknown;
}

export function LiveBoardExperience({
  workspaceSlug,
  boardId,
}: {
  workspaceSlug: string;
  boardId: string;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const [board, setBoard] = useState<BoardDto | null>(null);
  const [boardError, setBoardError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const sourceItems = useMemo(
    () =>
      workspace
        ? liveData.items.filter(
            (item) =>
              item.workspaceId === workspace.id && item.boardId === boardId,
          )
        : [],
    [boardId, liveData.items, workspace],
  );
  const [items, setItems] = useState<WorkItemDto[]>(sourceItems);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{
    kind: "saved" | "failed";
    title: string;
    description: string;
  } | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<WorkItemHistoryEntryDto[]>([]);
  const [evidence, setEvidence] = useState<WorkItemEvidenceDto[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const retryKeys = useRef(new Map<string, string>());
  const timezone = session.organization.timezone ?? "UTC";

  useEffect(() => {
    let active = true;
    liveData.client
      .board(boardId)
      .then((record) => {
        if (!active) return;
        if (!workspace || record.workspaceId !== workspace.id) {
          setBoardError(new Error("This board is not part of the workspace."));
          return;
        }
        setBoard(record);
        setBoardError(null);
      })
      .catch((reason: unknown) => {
        if (active) setBoardError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [boardId, liveData.client, workspace]);

  useEffect(() => {
    if (pendingIds.size === 0) setItems(sourceItems);
  }, [pendingIds.size, sourceItems]);

  useEffect(() => {
    const itemId = decodeURIComponent(window.location.hash.slice(1));
    if (!itemId || !sourceItems.some((item) => item.id === itemId)) return;
    setSelectedId(itemId);
  }, [sourceItems]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  const loadDetails = useCallback(
    async (itemId: string) => {
      setDetailLoading(true);
      try {
        const [nextHistory, nextEvidence] = await Promise.all([
          liveData.client.itemHistory(itemId),
          liveData.client.itemEvidence(itemId),
        ]);
        setHistory(nextHistory);
        setEvidence(nextEvidence);
      } catch (reason) {
        const presented = presentLiveError(reason);
        setNotice({
          kind: "failed",
          title: presented.title,
          description: presented.description,
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [liveData.client],
  );

  useEffect(() => {
    if (!selectedId) return;
    void loadDetails(selectedId);
  }, [loadDetails, selectedId]);

  function replaceItem(next: WorkItemDto) {
    setItems((current) =>
      current.some((item) => item.id === next.id)
        ? current.map((item) => (item.id === next.id ? next : item))
        : [...current, next],
    );
  }

  async function updateItemOptimistically(item: WorkItemDto, patch: ItemPatch) {
    const fingerprint = `update:${item.id}:${item.version}:${JSON.stringify(patch)}`;
    const idempotencyKey = retainedKey(retryKeys.current, fingerprint);
    const optimistic: WorkItemDto = {
      ...item,
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
      updatedAt: new Date().toISOString(),
    };
    replaceItem(optimistic);
    setPendingIds((current) => new Set(current).add(item.id));
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.updateItem(
        item.id,
        patch,
        item.version,
        idempotencyKey,
      );
      retryKeys.current.delete(fingerprint);
      replaceItem(response.data);
      setNotice({
        kind: "saved",
        title: `Server confirmed “${response.data.title}”`,
        description: `Version ${response.data.version} is now canonical.`,
      });
      await liveData.refresh();
    } catch (reason) {
      replaceItem(item);
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ itemId: item.id, patch, error: reason });
      } else {
        setNotice({
          kind: "failed",
          title: presented.title,
          description: presented.description,
        });
      }
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(item.id);
        return next;
      });
    }
  }

  async function reloadConflict() {
    if (!conflict) return;
    const latest = await liveData.client.item(conflict.itemId);
    replaceItem(latest);
    setConflict(null);
    setNotice({
      kind: "saved",
      title: "Loaded the latest server version",
      description: `Version ${latest.version} is visible. Your conflicting change was not applied.`,
    });
  }

  async function retryConflict() {
    if (!conflict) return;
    setPendingIds((current) => new Set(current).add(conflict.itemId));
    try {
      const latest = await liveData.client.item(conflict.itemId);
      const response = await liveData.client.updateItem(
        latest.id,
        conflict.patch,
        latest.version,
        crypto.randomUUID(),
      );
      replaceItem(response.data);
      setConflict(null);
      setNotice({
        kind: "saved",
        title: "Server confirmed the change against the latest version",
        description: `Version ${response.data.version} is now canonical.`,
      });
      await liveData.refresh();
    } catch (reason) {
      setConflict((current) =>
        current ? { ...current, error: reason } : current,
      );
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(conflict.itemId);
        return next;
      });
    }
  }

  if (!workspace || (!loading && (!board || boardError))) {
    const presented = boardError ? presentLiveError(boardError) : null;
    return (
      <WorkspaceFrame active="workspace" workspaceSlug={workspaceSlug}>
        <main className={styles.main}>
          <LiveStateNotice
            actions={
              <Link href={workspaceHref(workspaceSlug)}>
                Return to workspace
              </Link>
            }
            description={
              presented?.description ??
              "The board is outside this workspace or no longer accessible."
            }
            kind={presented?.kind ?? "permission-loss"}
            title={presented?.title ?? "Board not available"}
          />
        </main>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame active="workspace" workspaceSlug={workspaceSlug}>
      <main className={styles.main} data-testid="live-board">
        <header className={styles.hero}>
          <div>
            <p>
              <Link href={workspaceHref(workspaceSlug)}>{workspace.name}</Link>{" "}
              / Plan board
            </p>
            <h1>{board?.name ?? "Loading board…"}</h1>
            <span>
              A durable plan with versioned tasks, decisions, approvals, and
              evidence.
            </span>
          </div>
          <button
            className="primary-button"
            data-testid="create-item-open"
            disabled={!board}
            onClick={() => setCreateOpen(true)}
            type="button"
          >
            <Plus size={15} /> New task / work item
          </button>
        </header>

        {loading ? (
          <LiveStateNotice kind="loading" title="Loading canonical board" />
        ) : null}
        {liveData.stale ? (
          <LiveStateNotice
            actions={
              <button onClick={() => void liveData.refresh()} type="button">
                Refresh
              </button>
            }
            description="Last-known board data is still visible and timestamped."
            kind="stale"
            synced
            title="Board data may be stale"
          />
        ) : null}
        {notice ? (
          <LiveStateNotice
            description={notice.description}
            kind={notice.kind}
            title={notice.title}
          />
        ) : null}
        {conflict ? (
          <LiveStateNotice
            actions={
              <>
                <button onClick={() => void reloadConflict()} type="button">
                  Load latest
                </button>
                <button onClick={() => void retryConflict()} type="button">
                  Apply to latest
                </button>
              </>
            }
            description={presentLiveError(conflict.error).description}
            kind="version-conflict"
            title="Choose how to handle the newer server version"
          />
        ) : null}

        <section className={styles.panel} aria-labelledby="board-items-title">
          <header>
            <div>
              <p>One identity across the operating loop</p>
              <h2 id="board-items-title">Work items</h2>
            </div>
            <small>
              Last synced <LiveSyncedAt timezone={timezone} />
            </small>
          </header>
          {items.length === 0 && !loading ? (
            <LiveStateNotice
              actions={
                <button onClick={() => setCreateOpen(true)} type="button">
                  Create the first item
                </button>
              }
              description="Capture work here directly, or convert it from Inbox."
              kind="empty"
              title="This board is empty"
            />
          ) : (
            <div className={styles.itemTable} role="list">
              {items.map((item) => {
                const pending = pendingIds.has(item.id);
                return (
                  <article
                    className={styles.itemRow}
                    data-testid={`work-item-${item.id}`}
                    key={item.id}
                    role="listitem"
                  >
                    <button
                      className={styles.itemTitle}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <span className={styles.typePill}>{item.type}</span>
                      <strong>{item.title}</strong>
                      <small>
                        {item.assignees
                          .map((person) => person.name)
                          .join(", ") || "Unassigned"}
                      </small>
                    </button>
                    <label>
                      <span className="sr-only">Status for {item.title}</span>
                      <select
                        aria-label={`Status for ${item.title}`}
                        disabled={
                          pending ||
                          item.status === "blocked" ||
                          item.status === "done"
                        }
                        onChange={(event) =>
                          void updateItemOptimistically(item, {
                            status: event.target.value as WorkItemDto["status"],
                          })
                        }
                        value={item.status}
                      >
                        {editableStatusOptions(item.status).map((status) => (
                          <option key={status} value={status}>
                            {workItemStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span
                      className={styles.priority}
                      data-priority={item.priority}
                    >
                      {item.priority}
                    </span>
                    <span>
                      {item.dueDate
                        ? formatLiveDateOnly(item.dueDate, timezone)
                        : "No due date"}
                    </span>
                    <span className={styles.versionTag}>
                      {pending ? "Saving…" : `v${item.version}`}
                    </span>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {createOpen && board ? (
          <CreateWorkItemDialog
            board={board}
            onClose={() => setCreateOpen(false)}
            onConfirmed={async (item, replayed) => {
              replaceItem(item);
              setCreateOpen(false);
              setNotice({
                kind: "saved",
                title: `Server confirmed “${item.title}”`,
                description: replayed
                  ? "The original idempotent result was replayed; no duplicate was created."
                  : `Canonical WorkItem ${item.id} was created at version ${item.version}.`,
              });
              await liveData.refresh();
            }}
            workspaceId={workspace.id}
          />
        ) : null}

        {selected ? (
          <WorkItemDetail
            evidence={evidence}
            history={history}
            item={selected}
            loading={detailLoading}
            onClose={() => setSelectedId(null)}
            onConfirmed={async (next, confirmation) => {
              replaceItem(next);
              setNotice({
                kind: "saved",
                title: `Server confirmed “${next.title}”`,
                description: confirmation,
              });
              await liveData.refresh();
              await loadDetails(next.id);
            }}
            timezone={timezone}
          />
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}

function CreateWorkItemDialog({
  workspaceId,
  board,
  onClose,
  onConfirmed,
}: {
  workspaceId: string;
  board: BoardDto;
  onClose: () => void;
  onConfirmed: (item: WorkItemDto, replayed: boolean) => Promise<void>;
}) {
  const liveData = useLiveAppData();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkItemDto["type"]>("task");
  const [priority, setPriority] = useState<WorkItemDto["priority"]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  function edit() {
    if (error) {
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await liveData.client.createItem(
        {
          workspaceId,
          boardId: board.id,
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          status: "not_started",
          ...(dueDate ? { dueDate } : {}),
          assigneeIds: [],
          ...(type === "decision" ? { decisionState: "needed" } : {}),
          ...(type === "approval" ? { approvalState: "pending" } : {}),
        },
        idempotencyKey,
      );
      await onConfirmed(result.data, result.replayed);
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presented = error ? presentLiveError(error) : null;
  return (
    <div className="dialog-layer" onMouseDown={onClose} role="presentation">
      <form
        aria-labelledby="create-live-item-title"
        aria-modal="true"
        className={`capture-dialog ${styles.smallDialog}`}
        data-testid="create-item-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={submit}
        role="dialog"
      >
        <header>
          <span className="attention-icon">
            <Plus size={17} />
          </span>
          <div>
            <h2 id="create-live-item-title">Create a task or work item</h2>
            <p>Plan: {board.name}</p>
          </div>
          <button
            aria-label="Close work item creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <div className={styles.formBody}>
          {presented ? (
            <LiveStateNotice
              description={presented.description}
              kind={presented.kind}
              title={presented.title}
            />
          ) : pending ? (
            <LiveStateNotice
              description="No success is shown until the server returns the canonical WorkItem."
              kind="pending"
              title="Waiting for server confirmation"
            />
          ) : null}
          <label className={styles.field}>
            <span>Title</span>
            <input
              autoFocus
              maxLength={500}
              onChange={(event) => {
                edit();
                setTitle(event.target.value);
              }}
              required
              value={title}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Type</span>
              <select
                onChange={(event) => {
                  edit();
                  setType(event.target.value as WorkItemDto["type"]);
                }}
                value={type}
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
                ).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Priority</span>
              <select
                onChange={(event) => {
                  edit();
                  setPriority(event.target.value as WorkItemDto["priority"]);
                }}
                value={priority}
              >
                {(["urgent", "high", "normal", "low", "none"] as const).map(
                  (candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className={styles.field}>
              <span>Due date · Optional</span>
              <input
                onChange={(event) => {
                  edit();
                  setDueDate(event.target.value);
                }}
                type="date"
                value={dueDate}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>Description · Optional</span>
            <textarea
              maxLength={20_000}
              onChange={(event) => {
                edit();
                setDescription(event.target.value);
              }}
              rows={4}
              value={description}
            />
          </label>
        </div>
        <footer>
          <span>
            The retry key is retained until this exact draft is confirmed.
          </span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={pending || !title.trim()}
              type="submit"
            >
              {pending
                ? "Waiting for confirmation…"
                : error
                  ? "Retry same request"
                  : "Create task / work item"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}

function WorkItemDetail({
  item,
  history,
  evidence,
  loading,
  timezone,
  onClose,
  onConfirmed,
}: {
  item: WorkItemDto;
  history: WorkItemHistoryEntryDto[];
  evidence: WorkItemEvidenceDto[];
  loading: boolean;
  timezone: string;
  onClose: () => void;
  onConfirmed: (item: WorkItemDto, confirmation: string) => Promise<void>;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [reason, setReason] = useState("");
  const [evidenceBody, setEvidenceBody] = useState("");
  const [waitingDate, setWaitingDate] = useState(() =>
    tomorrowInTimeZone(timezone, new Date().toISOString()),
  );
  const [assignees, setAssignees] = useState<
    Array<{ id: string; name: string }>
  >([{ id: session.user.id, name: session.user.name }]);
  const [assigneeId, setAssigneeId] = useState(session.user.id);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pendingRef = useRef(false);
  const reasonRevision = useRef(0);
  const evidenceRevision = useRef(0);
  const retryKeys = useRef(new Map<string, string>());

  useEffect(() => {
    let active = true;
    liveData.client
      .memberships()
      .then((memberships) => {
        if (!active) return;
        const available = memberships
          .filter((membership) => membership.active)
          .map((membership) => membership.user);
        if (available.length) setAssignees(available);
      })
      .catch(() => {
        // Current-user assignment stays available if the directory is restricted.
      });
    return () => {
      active = false;
    };
  }, [liveData.client]);

  async function run(
    operation: () => Promise<{ item: WorkItemDto; confirmation: string }>,
    {
      consumeReason = false,
      consumeEvidence = false,
    }: { consumeReason?: boolean; consumeEvidence?: boolean } = {},
  ) {
    if (pendingRef.current) return;
    const submittedReason = reason;
    const submittedEvidenceBody = evidenceBody;
    const submittedReasonRevision = reasonRevision.current;
    const submittedEvidenceRevision = evidenceRevision.current;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await operation();
      await onConfirmed(result.item, result.confirmation);
      if (consumeReason) {
        setReason((current) =>
          reasonRevision.current === submittedReasonRevision &&
          current === submittedReason
            ? ""
            : current,
        );
      }
      if (consumeEvidence) {
        setEvidenceBody((current) =>
          evidenceRevision.current === submittedEvidenceRevision &&
          current === submittedEvidenceBody
            ? ""
            : current,
        );
      }
    } catch (failure) {
      setError(failure);
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  const presented = error ? presentLiveError(error) : null;
  return (
    <div
      className={styles.drawerLayer}
      role="presentation"
      onMouseDown={onClose}
    >
      <aside
        aria-labelledby="live-item-detail-title"
        aria-modal="true"
        className={styles.drawer}
        data-testid="work-item-detail"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header>
          <div>
            <p>
              {item.type} · v{item.version}
            </p>
            <h2 id="live-item-detail-title">{item.title}</h2>
          </div>
          <button
            aria-label="Close work item details"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <div className={styles.drawerBody}>
          {presented ? (
            <LiveStateNotice
              actions={
                presented.kind === "version-conflict" ? (
                  <button
                    onClick={() =>
                      void run(async () => {
                        const latest = await liveData.client.item(item.id);
                        return {
                          item: latest,
                          confirmation: `Loaded canonical version ${latest.version}. Your form values are still available to reapply.`,
                        };
                      })
                    }
                    type="button"
                  >
                    Load latest version
                  </button>
                ) : undefined
              }
              description={presented.description}
              kind={presented.kind}
              title={presented.title}
            />
          ) : pending ? (
            <LiveStateNotice
              description="The visible item will update only after server acknowledgement."
              kind="pending"
              title="Waiting for server confirmation"
            />
          ) : null}
          <section className={styles.detailSummary}>
            <span>
              Status <strong>{workItemStatusLabel(item.status)}</strong>
            </span>
            <span>
              Priority <strong>{item.priority}</strong>
            </span>
            <span>
              Updated{" "}
              <strong>{formatLiveDate(item.updatedAt, timezone)}</strong>
            </span>
          </section>
          {item.description ? <p>{item.description}</p> : null}
          <label className={styles.field}>
            <span>Reason or follow-up note</span>
            <textarea
              onChange={(event) => {
                reasonRevision.current += 1;
                setReason(event.target.value);
              }}
              rows={3}
              value={reason}
            />
          </label>
          <label className={styles.field}>
            <span>Evidence</span>
            <textarea
              onChange={(event) => {
                evidenceRevision.current += 1;
                setEvidenceBody(event.target.value);
              }}
              placeholder="Record observable proof, a link, or the resolved outcome"
              rows={3}
              value={evidenceBody}
            />
          </label>
          <label className={styles.field}>
            <span>Next follow-up</span>
            <input
              onChange={(event) => setWaitingDate(event.target.value)}
              required
              type="date"
              value={waitingDate}
            />
          </label>
          <label className={styles.field}>
            <span>Assignee</span>
            <select
              aria-label="Choose assignee"
              onChange={(event) => setAssigneeId(event.target.value)}
              value={assigneeId}
            >
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          <div className={styles.buttonGrid}>
            <button
              data-testid={`assign-item-${item.id}`}
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const response = await liveData.client.assignItem(
                    item.id,
                    { assigneeIds: [assigneeId] },
                    item.version,
                    retainedKey(
                      retryKeys.current,
                      `assign:${item.id}:${item.version}:${assigneeId}`,
                    ),
                  );
                  const assigneeName =
                    assignees.find((assignee) => assignee.id === assigneeId)
                      ?.name ?? "the selected member";
                  return {
                    item: response.data.item,
                    confirmation: `Assignment to ${assigneeName} is durable at version ${response.data.item.version}.`,
                  };
                })
              }
              type="button"
            >
              <UserPlus size={14} /> Assign selected person
            </button>
            <button
              data-testid={`block-item-${item.id}`}
              disabled={pending || !reason.trim()}
              onClick={() =>
                void run(
                  async () => {
                    const response = await liveData.client.setItemBlocked(
                      item.id,
                      {
                        blocked: item.status !== "blocked",
                        reason: reason.trim(),
                      },
                      item.version,
                      retainedKey(
                        retryKeys.current,
                        `block:${item.id}:${item.version}:${item.status !== "blocked"}:${reason.trim()}`,
                      ),
                    );
                    return {
                      item: response.data.item,
                      confirmation: response.data.attentionRefreshQueued
                        ? "Block state is durable; deterministic Attention recomputation is queued."
                        : "Block state is durable.",
                    };
                  },
                  { consumeReason: true },
                )
              }
              type="button"
            >
              <AlertTriangle size={14} />
              {item.status === "blocked" ? "Unblock" : "Block"}
            </button>
            <button
              data-testid={`evidence-item-${item.id}`}
              disabled={pending || !evidenceBody.trim()}
              onClick={() =>
                void run(
                  async () => {
                    const response = await liveData.client.addItemEvidence(
                      item.id,
                      { body: evidenceBody.trim() },
                      item.version,
                      retainedKey(
                        retryKeys.current,
                        `evidence:${item.id}:${item.version}:${evidenceBody.trim()}`,
                      ),
                    );
                    const latest = await liveData.client.item(item.id);
                    return {
                      item: latest,
                      confirmation: `Evidence ${response.data.evidence.id} is durable at item version ${response.data.itemVersion}.`,
                    };
                  },
                  { consumeEvidence: true },
                )
              }
              type="button"
            >
              <Link2 size={14} /> Add evidence
            </button>
            <button
              data-testid={`resolve-item-${item.id}`}
              disabled={
                pending || !evidenceBody.trim() || item.status === "done"
              }
              onClick={() =>
                void run(
                  async () => {
                    const response = await liveData.client.resolveItem(
                      item.id,
                      { evidence: evidenceBody.trim() },
                      item.version,
                      retainedKey(
                        retryKeys.current,
                        `resolve:${item.id}:${item.version}:${evidenceBody.trim()}`,
                      ),
                    );
                    return {
                      item: response.data.item,
                      confirmation: response.data.attentionRefreshQueued
                        ? "Resolution and evidence are durable; Attention recomputation is queued."
                        : "Resolution and evidence are durable.",
                    };
                  },
                  { consumeEvidence: true },
                )
              }
              type="button"
            >
              <CheckCircle2 size={14} /> Resolve with evidence
            </button>
            <button
              data-testid={`waiting-item-${item.id}`}
              disabled={pending || !reason.trim() || item.status === "done"}
              onClick={() =>
                void run(
                  async () => {
                    const response = await liveData.client.createWaiting(
                      {
                        workspaceId: item.workspaceId,
                        entityType: "work_item",
                        entityId: item.id,
                        title: item.title,
                        waitingType: "other",
                        waitingLabel: reason.trim().slice(0, 200),
                        followUpOwnerId: session.user.id,
                        expectedBy: waitingDate,
                        nextFollowUp: waitingDate,
                        note: reason.trim(),
                      },
                      item.version,
                      retainedKey(
                        retryKeys.current,
                        `waiting:${item.id}:${item.version}:${reason.trim()}:${waitingDate}`,
                      ),
                    );
                    const latest = await liveData.client.item(item.id);
                    return {
                      item: latest,
                      confirmation: `Waiting record ${response.data.id} is durable at version ${response.data.version}; WorkItem version ${latest.version} is canonical.`,
                    };
                  },
                  { consumeReason: true },
                )
              }
              type="button"
            >
              <Clock3 size={14} /> Move to Waiting
            </button>
          </div>

          <section className={styles.timeline} aria-labelledby="evidence-title">
            <h3 id="evidence-title">
              <FileText size={15} /> Evidence
            </h3>
            {loading ? (
              <p>Loading durable evidence…</p>
            ) : evidence.length === 0 ? (
              <p>No evidence recorded yet.</p>
            ) : (
              evidence.map((record) => (
                <article key={record.id}>
                  <strong>{record.author.name}</strong>
                  <p>{record.body}</p>
                  <small>{formatLiveDate(record.createdAt, timezone)}</small>
                </article>
              ))
            )}
          </section>
          <section className={styles.timeline} aria-labelledby="history-title">
            <h3 id="history-title">
              <History size={15} /> Change history
            </h3>
            {loading ? (
              <p>Loading durable history…</p>
            ) : history.length === 0 ? (
              <p>No history recorded yet.</p>
            ) : (
              history.map((entry) => (
                <article key={entry.id}>
                  <strong>{entry.summary}</strong>
                  <p>Reason code: {entry.reasonCode}</p>
                  <small>{formatLiveDate(entry.occurredAt, timezone)}</small>
                </article>
              ))
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

function editableStatusOptions(current: WorkItemDto["status"]) {
  const editable = ["not_started", "working", "review"] as const;
  return new Set<WorkItemDto["status"]>(editable).has(current)
    ? [...editable]
    : [current, ...editable];
}

function tomorrowInTimeZone(timezone: string, referenceTime: string) {
  const tomorrow = new Date(Date.parse(referenceTime) + 86_400_000);
  const parts = dateTimeFormatter("en", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: timezone,
  }).formatToParts(tomorrow);
  const part = (type: "year" | "month" | "day") =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function retainedKey(keys: Map<string, string>, fingerprint: string) {
  const existing = keys.get(fingerprint);
  if (existing) return existing;
  const created = crypto.randomUUID();
  keys.set(fingerprint, created);
  return created;
}
