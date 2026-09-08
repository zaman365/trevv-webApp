"use client";

import { dateTimeFormatter } from "@/lib/date-format";

import type {
  BoardDto,
  WorkItemDto,
  WorkItemEvidenceDto,
  WorkItemHistoryEntryDto,
} from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
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
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkItemDetails } from "@/lib/use-work-item-details";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError, presentLiveReadError } from "@/lib/live-errors";
import {
  formatLiveDate,
  formatLiveDateOnly,
  workItemStatusLabel,
} from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice, LiveSyncedAt } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-operating-loop.module.css";
import { LiveTaskList } from "./live-task-list";
import { ProjectPlanningContent } from "./live-project-planning";
import {
  LiveTaskPlanningFields,
  LiveTaskPlanningSummary,
} from "./live-task-planning-fields";
import { LiveAssigneeField } from "./live-assignee-field";

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
  const queryClient = useQueryClient();
  const boardQuery = useQuery({
    queryKey: workspaceResourceKeys.board(
      session.organization.id,
      workspace?.id ?? "",
      boardId,
    ),
    queryFn: async ({ signal }) => {
      const record = await liveData.client.withSignal(signal).board(boardId);
      if (record.workspaceId !== workspace?.id)
        throw new Error("This board is not part of the workspace.");
      return record;
    },
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  useReportRouteReady(boardQuery.isSuccess && liveData.recordsReady);
  const board = boardQuery.data;
  const boardError = boardQuery.error;
  const loading = boardQuery.isPending;
  const sourceItems = useMemo(
    () =>
      workspace
        ? liveData.items.filter(
            (item) =>
              item.workspaceId === workspace.id &&
              (item.boardId === boardId || item.planning?.cycleId === boardId),
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
  const detailsQuery = useWorkItemDetails(
    liveData.client,
    session.organization.id,
    workspace?.id,
    selectedId,
  );
  const detailsAccessLost =
    detailsQuery.error instanceof TrevvApiError &&
    [401, 403, 404].includes(detailsQuery.error.status);
  const history = detailsAccessLost ? [] : (detailsQuery.data?.history ?? []);
  const evidence = detailsAccessLost ? [] : (detailsQuery.data?.evidence ?? []);
  const detailLoading = detailsQuery.isPending;
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<WorkItemDto["type"]>("task");
  const retryKeys = useRef(new Map<string, string>());
  const timezone = session.organization.timezone ?? "UTC";
  const [itemHash, setItemHash] = useState("");
  const openedHash = useRef("");

  useEffect(() => {
    if (pendingIds.size === 0) setItems(sourceItems);
  }, [pendingIds.size, sourceItems]);

  useEffect(() => {
    const readHash = () => {
      try {
        setItemHash(decodeURIComponent(window.location.hash.slice(1)));
      } catch {
        setItemHash("");
      }
      openedHash.current = "";
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, [boardId]);

  useEffect(() => {
    if (
      !itemHash ||
      openedHash.current === itemHash ||
      !sourceItems.some((item) => item.id === itemHash)
    )
      return;
    openedHash.current = itemHash;
    setSelectedId(itemHash);
  }, [itemHash, sourceItems]);

  const selected = items.find((item) => item.id === selectedId) ?? null;

  async function loadDetails(itemId: string) {
    await queryClient.invalidateQueries({
      queryKey: workspaceResourceKeys.itemDetails(
        session.organization.id,
        workspace?.id ?? "",
        itemId,
      ),
    });
  }

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
      ...(patch.dueDate ? { dueDate: patch.dueDate } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (patch.dueDate === null) delete optimistic.dueDate;
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
      await liveData.applyConfirmedItem(response.data);
      replaceItem(response.data);
      setNotice({
        kind: "saved",
        title: `Server confirmed “${response.data.title}”`,
        description: `Version ${response.data.version} is now canonical.`,
      });
      void liveData.refresh({ backgroundRecords: true });
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
    try {
      const latest = await liveData.client.item(conflict.itemId);
      await liveData.applyConfirmedItem(latest);
      replaceItem(latest);
      setConflict(null);
      setNotice({
        kind: "saved",
        title: "Loaded the latest server version",
        description: `Version ${latest.version} is visible. Your conflicting change was not applied.`,
      });
    } catch (error) {
      setConflict((current) => (current ? { ...current, error } : current));
    }
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
      await liveData.applyConfirmedItem(response.data);
      replaceItem(response.data);
      setConflict(null);
      setNotice({
        kind: "saved",
        title: "Server confirmed the change against the latest version",
        description: `Version ${response.data.version} is now canonical.`,
      });
      void liveData.refresh({ backgroundRecords: true });
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

  const boardAccessLost =
    boardError instanceof TrevvApiError &&
    [401, 403, 404].includes(boardError.status);
  if (!workspace || (!loading && (!board || boardAccessLost))) {
    const presented = boardError ? presentLiveError(boardError) : null;
    return (
      <WorkspaceFrame active="workspace" workspaceSlug={workspaceSlug}>
        <main className={styles.main}>
          <LiveStateNotice
            actions={
              <>
                {boardError && !boardAccessLost ? (
                  <button
                    type="button"
                    onClick={() => void boardQuery.refetch()}
                  >
                    Retry board
                  </button>
                ) : null}
                <Link href={workspaceHref(workspaceSlug)}>
                  Return to workspace
                </Link>
              </>
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
              / Project board
            </p>
            <h1>{board?.name ?? "Loading board…"}</h1>
            <span>
              Tasks, owners, due dates, and progress — together in one project.
            </span>
          </div>
          <button
            className="primary-button"
            data-testid="create-item-open"
            disabled={!board}
            onClick={() => {
              setCreateType("task");
              setCreateOpen(true);
            }}
            type="button"
          >
            <Plus size={15} /> New task / work item
          </button>
        </header>

        <div className={styles.rowActions}>
          <Link href={workspaceHref(workspaceSlug, "planning")}>
            All projects and sprints
          </Link>
          <button
            type="button"
            disabled={!board}
            onClick={() => {
              setCreateType("milestone");
              setCreateOpen(true);
            }}
          >
            New milestone
          </button>
          {board?.planning?.parentBoardId ? (
            <Link
              href={`${workspaceHref(workspaceSlug)}/boards/${board.planning.parentBoardId}`}
            >
              Parent project
            </Link>
          ) : null}
        </div>
        {board?.description ? (
          <p style={{ whiteSpace: "pre-wrap" }}>{board.description}</p>
        ) : null}
        {board ? (
          <p>
            {board.planning?.state ?? "planned"} ·{" "}
            {board.startDate ?? "No start date"} →{" "}
            {board.endDate ?? "No target date"}
          </p>
        ) : null}
        {loading ? (
          <LiveStateNotice kind="loading" title="Loading canonical board" />
        ) : null}
        {board && boardError && !boardAccessLost ? (
          <LiveStateNotice
            {...presentLiveReadError(boardError)}
            actions={
              <button type="button" onClick={() => void boardQuery.refetch()}>
                Retry board
              </button>
            }
          />
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
              <p>Plan and follow through</p>
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
                  {liveData.recordsComplete
                    ? "Create the first item"
                    : "Create an item"}
                </button>
              }
              description={
                liveData.recordsComplete
                  ? "Capture work here directly, or convert it from Inbox."
                  : "More workspace records are still arriving. You can create work while they load."
              }
              kind={liveData.recordsComplete ? "empty" : "loading"}
              title={
                liveData.recordsComplete
                  ? "This board is empty"
                  : "Loading board items"
              }
            />
          ) : (
            <LiveTaskList
              items={items}
              workspaces={[workspace]}
              userId={session.user.id}
              timezone={timezone}
              pendingIds={pendingIds}
              onStatusChange={(item, status) =>
                void updateItemOptimistically(item, { status })
              }
              onOpen={(item) => setSelectedId(item.id)}
              label="Board work items"
              complete={liveData.recordsComplete}
            />
          )}
        </section>

        {board && !board.planning?.parentBoardId ? (
          <ProjectPlanningContent
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
            parentBoard={board}
            {...(board.planning?.teamId
              ? { teamId: board.planning.teamId }
              : {})}
          />
        ) : null}

        {createOpen && board ? (
          <CreateWorkItemDialog
            initialType={createType}
            board={board}
            onClose={() => setCreateOpen(false)}
            onConfirmed={async (item, replayed) => {
              await liveData.applyConfirmedItem(item);
              replaceItem(item);
              setCreateOpen(false);
              setSelectedId(item.id);
              setNotice({
                kind: "saved",
                title: `Server confirmed “${item.title}”`,
                description: replayed
                  ? "The original idempotent result was replayed; no duplicate was created."
                  : `Canonical WorkItem ${item.id} was created at version ${item.version}.`,
              });
              void liveData.refresh({ backgroundRecords: true });
            }}
            workspaceId={workspace.id}
          />
        ) : null}

        {selected && detailsQuery.error ? (
          <LiveStateNotice
            {...presentLiveError(detailsQuery.error)}
            actions={
              <button type="button" onClick={() => void detailsQuery.refetch()}>
                Retry item details
              </button>
            }
          />
        ) : null}
        {selected ? (
          <WorkItemDetail
            key={selected.id}
            evidence={evidence}
            history={history}
            item={selected}
            loading={detailLoading}
            onClose={() => setSelectedId(null)}
            onConfirmed={async (next, confirmation) => {
              await liveData.applyConfirmedItem(next);
              replaceItem(next);
              setNotice({
                kind: "saved",
                title: `Server confirmed “${next.title}”`,
                description: confirmation,
              });
              void liveData.refresh();
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
  initialType,
  workspaceId,
  board,
  onClose,
  onConfirmed,
}: {
  workspaceId: string;
  board: BoardDto;
  initialType: WorkItemDto["type"];
  onClose: () => void;
  onConfirmed: (item: WorkItemDto, replayed: boolean) => Promise<void>;
}) {
  const liveData = useLiveAppData();
  const dialogRef = useAccessibleDialog<HTMLFormElement>(onClose);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<WorkItemDto["type"]>(initialType);
  const [planning, setPlanning] = useState<
    NonNullable<WorkItemDto["planning"]>
  >({
    ...(board.planning?.teamId ? { teamId: board.planning.teamId } : {}),
    ...(board.planning?.parentBoardId ? { cycleId: board.id } : {}),
  });
  const [priority, setPriority] = useState<WorkItemDto["priority"]>("normal");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
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
          boardId: board.planning?.parentBoardId ?? board.id,
          planning,
          title: title.trim(),
          description: description.trim(),
          type,
          priority,
          status: "not_started",
          ...(dueDate ? { dueDate } : {}),
          assigneeIds: assigneeId ? [assigneeId] : [],
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
    <div
      className={`dialog-layer ${styles.dialogLayer}`}
      onMouseDown={onClose}
      role="presentation"
    >
      <form
        aria-labelledby="create-live-item-title"
        aria-modal="true"
        className={`capture-dialog ${styles.captureDialog}`}
        data-testid="create-item-dialog"
        ref={dialogRef}
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
        <fieldset className={styles.formBody} disabled={pending}>
          {presented ? (
            <LiveStateNotice
              description={presented.description}
              kind={presented.kind}
              title={presented.title}
            />
          ) : pending ? (
            <LiveStateNotice
              description="Saving the task and its assignment."
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
          <LiveAssigneeField
            workspaceId={workspaceId}
            value={assigneeId}
            onChange={(id) => {
              edit();
              setAssigneeId(id);
            }}
          />
          <LiveTaskPlanningFields
            workspaceId={workspaceId}
            boardId={board.id}
            value={planning}
            onChange={(value) => {
              edit();
              setPlanning(value);
            }}
          />
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
        </fieldset>
        <footer>
          <span>
            The task, its owner and planning details are saved together.
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
  const [updateBody, setUpdateBody] = useState("");
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editDescription, setEditDescription] = useState(item.description);
  const [editPlanning, setEditPlanning] = useState(item.planning ?? {});
  const [editPriority, setEditPriority] = useState(item.priority);
  const [editDueDate, setEditDueDate] = useState(item.dueDate ?? "");
  const [editVersion, setEditVersion] = useState(item.version);
  const dialogRef = useAccessibleDialog<HTMLElement>(onClose);
  const [waitingDate, setWaitingDate] = useState(() =>
    tomorrowInTimeZone(timezone, new Date().toISOString()),
  );
  const [assigneeId, setAssigneeId] = useState(
    item.assignees[0]?.id ?? session.user.id,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pendingRef = useRef(false);
  const reasonRevision = useRef(0);
  const evidenceRevision = useRef(0);
  const retryKeys = useRef(new Map<string, string>());

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
        ref={dialogRef}
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
          {item.status === "done" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  const response = await liveData.client.updateItem(
                    item.id,
                    { status: "not_started" },
                    item.version,
                    retainedKey(
                      retryKeys.current,
                      `reopen:${item.id}:${item.version}`,
                    ),
                  );
                  return {
                    item: response.data,
                    confirmation:
                      "Task reopened. Its updates and completion evidence are kept.",
                  };
                })
              }
            >
              Reopen task
            </button>
          ) : null}
          {item.description ? <p>{item.description}</p> : null}
          <section className={styles.detailEditor} aria-label="Task owner">
            <p>
              Assigned to:{" "}
              {item.assignees.map((person) => person.name).join(", ") ||
                "Unassigned"}
            </p>
            <LiveAssigneeField
              workspaceId={item.workspaceId}
              value={assigneeId}
              onChange={setAssigneeId}
              disabled={pending}
              allowUnassigned={true}
            />
            <div className={styles.buttonGrid}>
              <button
                data-testid={`assign-item-${item.id}`}
                disabled={pending}
                onClick={() =>
                  void run(async () => {
                    const response = await liveData.client.assignItem(
                      item.id,
                      { assigneeIds: assigneeId ? [assigneeId] : [] },
                      item.version,
                      retainedKey(
                        retryKeys.current,
                        `assign:${item.id}:${item.version}:${assigneeId}`,
                      ),
                    );
                    const assigneeName =
                      response.data.item.assignees.find(
                        (assignee) => assignee.id === assigneeId,
                      )?.name ?? "the selected member";
                    return {
                      item: response.data.item,
                      confirmation: assigneeId
                        ? `Task assigned to ${assigneeName}.`
                        : "Task is now unassigned.",
                    };
                  })
                }
                type="button"
              >
                <UserPlus size={14} />{" "}
                {assigneeId ? "Assign selected person" : "Remove assignment"}
              </button>
            </div>
          </section>
          <LiveTaskPlanningSummary item={item} />
          <section className={styles.detailEditor} aria-label="Task details">
            <header>
              <h3>Details</h3>
              {!editing ? (
                <button
                  type="button"
                  onClick={() => {
                    setEditTitle(item.title);
                    setEditDescription(item.description);
                    setEditPriority(item.priority);
                    setEditPlanning(item.planning ?? {});
                    setEditDueDate(item.dueDate ?? "");
                    setEditVersion(item.version);
                    setEditing(true);
                  }}
                >
                  Edit details
                </button>
              ) : null}
            </header>
            {editing ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const patch = {
                    title: editTitle.trim(),
                    description: editDescription.trim(),
                    priority: editPriority,
                    dueDate: editDueDate || null,
                    planning: editPlanning,
                  };
                  void run(async () => {
                    const response = await liveData.client.updateItem(
                      item.id,
                      patch,
                      editVersion,
                      retainedKey(
                        retryKeys.current,
                        `details:${item.id}:${editVersion}:${JSON.stringify(patch)}`,
                      ),
                    );
                    setEditing(false);
                    return {
                      item: response.data,
                      confirmation: "Task details saved.",
                    };
                  });
                }}
              >
                {editing && editVersion !== item.version ? (
                  <LiveStateNotice
                    kind="version-conflict"
                    title="This task changed while you were editing"
                    description="Your draft is kept. Review the current details, then apply your draft to the latest task."
                    actions={
                      <button
                        type="button"
                        onClick={() => setEditVersion(item.version)}
                      >
                        Use latest version for my draft
                      </button>
                    }
                  />
                ) : null}
                <label className={styles.field}>
                  <span>Task title</span>
                  <input
                    required
                    maxLength={500}
                    disabled={pending}
                    value={editTitle}
                    onChange={(event) => setEditTitle(event.target.value)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Description</span>
                  <textarea
                    maxLength={20000}
                    rows={4}
                    disabled={pending}
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                </label>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Priority</span>
                    <select
                      disabled={pending}
                      value={editPriority}
                      onChange={(event) =>
                        setEditPriority(
                          event.target.value as WorkItemDto["priority"],
                        )
                      }
                    >
                      {["urgent", "high", "normal", "low", "none"].map(
                        (priority) => (
                          <option key={priority}>{priority}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Due date</span>
                    <input
                      type="date"
                      disabled={pending}
                      value={editDueDate}
                      onChange={(event) => setEditDueDate(event.target.value)}
                    />
                  </label>
                </div>
                <LiveTaskPlanningFields
                  workspaceId={item.workspaceId}
                  boardId={item.boardId}
                  itemId={item.id}
                  value={editPlanning}
                  onChange={setEditPlanning}
                />
                <div className={styles.buttonGrid}>
                  <button
                    type="submit"
                    disabled={
                      pending ||
                      !editTitle.trim() ||
                      editVersion !== item.version
                    }
                  >
                    Save changes
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setEditing(false)}
                  >
                    Cancel editing
                  </button>
                </div>
              </form>
            ) : (
              <p>
                {item.dueDate
                  ? `Due ${formatLiveDateOnly(item.dueDate, timezone)}`
                  : "No due date"}
              </p>
            )}
          </section>
          <label className={styles.field}>
            <span>Work status</span>
            <select
              value={item.status}
              disabled={
                pending || item.status === "blocked" || item.status === "done"
              }
              onChange={(event) => {
                const status = event.target.value as WorkItemDto["status"];
                void run(async () => {
                  const response = await liveData.client.updateItem(
                    item.id,
                    { status },
                    item.version,
                    retainedKey(
                      retryKeys.current,
                      `status:${item.id}:${item.version}:${status}`,
                    ),
                  );
                  return {
                    item: response.data,
                    confirmation: `Status updated to ${workItemStatusLabel(response.data.status)}.`,
                  };
                });
              }}
            >
              {editableStatusOptions(item.status).map((status) => (
                <option key={status} value={status}>
                  {workItemStatusLabel(status)}
                </option>
              ))}
            </select>
            <small>
              Use Resolve with evidence below to complete this item.
            </small>
          </label>
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
          <div className={styles.buttonGrid}>
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

          <form
            className={styles.detailEditor}
            onSubmit={(event) => {
              event.preventDefault();
              const body = updateBody.trim();
              if (!body) return;
              void run(async () => {
                await liveData.client.addItemEvidence(
                  item.id,
                  { body },
                  item.version,
                  retainedKey(
                    retryKeys.current,
                    `update:${item.id}:${item.version}:${body}`,
                  ),
                );
                const latest = await liveData.client.item(item.id);
                setUpdateBody((current) =>
                  current.trim() === body ? "" : current,
                );
                return {
                  item: latest,
                  confirmation: "Update posted to this task.",
                };
              });
            }}
          >
            <label className={styles.field}>
              <span>Post an update</span>
              <textarea
                rows={3}
                maxLength={20000}
                value={updateBody}
                disabled={pending}
                onChange={(event) => setUpdateBody(event.target.value)}
                placeholder="Ask a question, share progress, or explain the next step…"
              />
            </label>
            <button type="submit" disabled={pending || !updateBody.trim()}>
              Post update
            </button>
            <small>
              Visible to people with access to this task. Updates stay with its
              evidence and history.
            </small>
          </form>

          <section className={styles.timeline} aria-labelledby="evidence-title">
            <h3 id="evidence-title">
              <FileText size={15} /> Updates and evidence
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
