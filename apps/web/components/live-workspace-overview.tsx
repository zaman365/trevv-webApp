"use client";

import type { BoardDto } from "@founderhq/api-contract";
import {
  Blocks,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  FolderKanban,
  Inbox,
  LayoutList,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { countByKey, workspaceRollups } from "@/lib/collection-index";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  formatLiveDate,
  formatLiveDateOnly,
  workspaceItems,
} from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveCreateTask } from "./live-create-task";
import { LiveMyWork } from "./live-work-my-work";
import styles from "./live-operating-loop.module.css";

export function LiveWorkspaceOverview({
  workspaceSlug,
  dashboard = false,
}: {
  workspaceSlug: string;
  dashboard?: boolean;
}) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const workspace = liveData.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const queryClient = useQueryClient();
  const boardsKey = workspaceResourceKeys.boards(
    session.organization.id,
    workspace?.id ?? "",
  );
  const boardsQuery = useQuery({
    queryKey: boardsKey,
    queryFn: ({ signal }) =>
      liveData.client.withSignal(signal).boards(workspace!.id),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const operationsQuery = useQuery({
    queryKey: workspaceResourceKeys.operations(session.organization.id),
    queryFn: ({ signal }) =>
      liveData.client.withSignal(signal).operationStatus(),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  useReportRouteReady(boardsQuery.isSuccess && liveData.recordsReady);
  const boards = boardsQuery.data ?? [];
  const loadingBoards = boardsQuery.isPending;
  const operationStatus = operationsQuery.data;
  const loadError = boardsQuery.error;
  const [createOpen, setCreateOpen] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [boardDescription, setBoardDescription] = useState("");
  const [boardStartDate, setBoardStartDate] = useState("");
  const [boardEndDate, setBoardEndDate] = useState("");
  const [pending, setPending] = useState(false);
  const [mutationError, setMutationError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [confirmedBoard, setConfirmedBoard] = useState<BoardDto | null>(null);

  const items = useMemo(
    () => workspaceItems(liveData.items, workspace?.id ?? ""),
    [liveData.items, workspace?.id],
  );
  const boardItemCounts = useMemo(
    () => countByKey(items, (item) => item.boardId),
    [items],
  );
  const itemTotals = useMemo(
    () => workspaceRollups(items, []).get(workspace?.id ?? ""),
    [items, workspace?.id],
  );
  const workspaceSummary = liveData.summary?.workspaces.find(
    (summary) => summary.workspaceId === workspace?.id,
  );
  const countLabel = (value: number) =>
    liveData.recordsComplete ? value : `${value} loaded`;
  if (!workspace) {
    return (
      <WorkspaceFrame active={dashboard ? "dashboard" : "workspace"}>
        <main className={styles.main}>
          <LiveStateNotice
            description="Refresh your accessible workspaces or return to Portfolio."
            kind="permission-loss"
            title="This workspace is no longer available"
            actions={<Link href="/app/portfolio">Return to Portfolio</Link>}
          />
        </main>
      </WorkspaceFrame>
    );
  }

  const workspaceId = workspace.id;
  const attention = liveData.attention.filter(
    (signal) =>
      signal.workspaceId === workspaceId &&
      !signal.resolvedAt &&
      !signal.dismissedAt,
  );
  const waiting = liveData.waiting.filter(
    (record) => record.workspaceId === workspaceId && !record.resolvedAt,
  );
  const timezone = session.organization.timezone ?? "UTC";

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!boardName.trim() || pending) return;
    setPending(true);
    setMutationError(null);
    try {
      const result = await liveData.client.createBoard(
        {
          workspaceId,
          name: boardName.trim(),
          description: boardDescription.trim(),
          visibility: "private",
          progressMode: "task_completion",
          ...(boardStartDate ? { startDate: boardStartDate } : {}),
          ...(boardEndDate ? { endDate: boardEndDate } : {}),
        },
        idempotencyKey,
      );
      queryClient.setQueryData<BoardDto[]>(boardsKey, (current) => [
        ...(current ?? []),
        result.data,
      ]);
      setConfirmedBoard(result.data);
      setCreateOpen(false);
      setBoardName("");
      setBoardDescription("");
      setBoardStartDate("");
      setBoardEndDate("");
      setIdempotencyKey(crypto.randomUUID());
      void liveData.refresh();
    } catch (reason) {
      setMutationError(reason);
    } finally {
      setPending(false);
    }
  }

  const presentedLoadError = loadError ? presentLiveError(loadError) : null;
  const presentedMutationError = mutationError
    ? presentLiveError(mutationError)
    : null;

  return (
    <WorkspaceFrame
      active={dashboard ? "dashboard" : "workspace"}
      workspaceSlug={workspaceSlug}
    >
      <main
        className={styles.main}
        data-testid={dashboard ? "live-dashboard" : "live-workspace-overview"}
      >
        <header className={styles.hero}>
          <div>
            <p>
              Workspace · {workspace.type.replaceAll("_", " ")} ·{" "}
              {dashboard ? "Dashboard" : "Overview"}
            </p>
            <h1>{workspace.name}</h1>
            <span>
              {workspace.priority ||
                workspace.description ||
                "No current priority has been recorded."}
            </span>
          </div>
          <LiveCreateTask workspaces={[workspace]} />
        </header>

        <nav
          className={styles.workspaceShortcuts}
          aria-label="Workspace shortcuts"
        >
          <Link href={workspaceHref(workspace.slug, "my-work")}>My Work</Link>
          <Link href={workspaceHref(workspace.slug, "teams")}>
            Teams and people
          </Link>
          <Link href={workspaceHref(workspace.slug, "messages")}>Messages</Link>
          <Link href={workspaceHref(workspace.slug, "inbox")}>
            <Inbox size={14} /> Open Inbox
          </Link>
        </nav>

        {liveData.stale ? (
          <LiveStateNotice
            actions={
              <button onClick={() => void liveData.refresh()} type="button">
                Refresh
              </button>
            }
            description="Last-known workspace data remains timestamped while TREVV reconnects."
            kind="stale"
            synced
            title="Workspace data may be stale"
          />
        ) : null}
        {presentedLoadError ? (
          <LiveStateNotice
            actions={
              <button
                onClick={() => {
                  void boardsQuery.refetch();
                  void operationsQuery.refetch();
                }}
                type="button"
              >
                Retry loading
              </button>
            }
            description={presentedLoadError.description}
            kind={presentedLoadError.kind}
            title={presentedLoadError.title}
          />
        ) : null}
        {confirmedBoard ? (
          <LiveStateNotice
            actions={
              <Link
                href={`${workspaceHref(workspace.slug)}/boards/${encodeURIComponent(confirmedBoard.id)}`}
              >
                Open plan
              </Link>
            }
            description="The plan is durable and ready for tasks and other canonical WorkItems."
            kind="saved"
            title={`Server confirmed “${confirmedBoard.name}”`}
          />
        ) : null}

        <section className={styles.statGrid} aria-label="Workspace totals">
          <article>
            <LayoutList size={18} />
            <strong>
              {workspaceSummary?.open ?? countLabel(itemTotals?.open ?? 0)}
            </strong>
            <span>Open work</span>
          </article>
          <article>
            <Blocks size={18} />
            <strong>
              {workspaceSummary?.blocked ??
                countLabel(itemTotals?.blocked ?? 0)}
            </strong>
            <span>Blocked</span>
          </article>
          <article>
            <Sparkles size={18} />
            <strong>{countLabel(attention.length)}</strong>
            <span>Need attention</span>
          </article>
          <article>
            <Clock3 size={18} />
            <strong>{countLabel(waiting.length)}</strong>
            <span>Waiting</span>
          </article>
        </section>

        <div className={styles.twoColumns}>
          <section className={styles.panel} aria-labelledby="live-boards-title">
            <header>
              <div>
                <p>Projects and plans</p>
                <h2 id="live-boards-title">Plans</h2>
              </div>
              <button
                data-testid="create-board-open"
                onClick={() => setCreateOpen(true)}
                type="button"
              >
                <Plus size={14} /> New plan
              </button>
            </header>
            {loadingBoards ? (
              <LiveStateNotice kind="loading" title="Loading boards" />
            ) : boards.length === 0 ? (
              <LiveStateNotice
                actions={
                  <button onClick={() => setCreateOpen(true)} type="button">
                    Create plan
                  </button>
                }
                description="A plan is stored as a durable board so tasks, decisions, and approvals share one canonical work container."
                kind="empty"
                title="No plans yet"
              />
            ) : (
              <div className={styles.list}>
                {boards.map((board) => {
                  const itemCount = boardItemCounts.get(board.id) ?? 0;
                  return (
                    <Link
                      className={styles.listRow}
                      data-testid={`board-link-${board.id}`}
                      href={`${workspaceHref(workspace.slug)}/boards/${encodeURIComponent(board.id)}`}
                      key={board.id}
                    >
                      <span className={styles.rowIcon}>
                        <FolderKanban size={16} />
                      </span>
                      <span>
                        <strong>{board.name}</strong>
                        <small>
                          {countLabel(itemCount)} item
                          {itemCount === 1 ? "" : "s"} · {board.visibility}
                        </small>
                      </span>
                      <small>
                        Updated {formatLiveDate(board.updatedAt, timezone)}
                      </small>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.panel} aria-labelledby="live-loop-title">
            <header>
              <div>
                <p>Founder operating loop</p>
                <h2 id="live-loop-title">What needs movement</h2>
              </div>
            </header>
            <nav
              className={styles.actionList}
              aria-label="Operating loop views"
            >
              <Link href={workspaceHref(workspace.slug, "attention")}>
                <Sparkles size={16} />
                <span>
                  <strong>Attention</strong>
                  <small>
                    {countLabel(attention.length)} deterministic signals
                  </small>
                </span>
              </Link>
              <Link href={workspaceHref(workspace.slug, "decisions")}>
                <FileQuestion size={16} />
                <span>
                  <strong>Decisions</strong>
                  <small>{countLabel(itemTotals?.decisions ?? 0)} open</small>
                </span>
              </Link>
              <Link href={workspaceHref(workspace.slug, "approvals")}>
                <ClipboardCheck size={16} />
                <span>
                  <strong>Approvals</strong>
                  <small>{countLabel(itemTotals?.approvals ?? 0)} open</small>
                </span>
              </Link>
              <Link href={workspaceHref(workspace.slug, "waiting")}>
                <Clock3 size={16} />
                <span>
                  <strong>Waiting</strong>
                  <small>{countLabel(waiting.length)} active follow-ups</small>
                </span>
              </Link>
            </nav>
          </section>
        </div>

        <LiveMyWork
          items={items}
          workspaceSlug={workspaceSlug}
          assignedToMe={false}
          title="Workspace tasks"
        />

        <section
          className={styles.panel}
          aria-labelledby="live-operations-title"
        >
          <header>
            <div>
              <p>Internal worker visibility</p>
              <h2 id="live-operations-title">Recomputation health</h2>
            </div>
          </header>
          {operationStatus ? (
            <div className={styles.operationsRow}>
              <span>
                <strong>{operationStatus.pendingOutbox}</strong>
                Pending outbox records
              </span>
              <span>
                <strong>{operationStatus.failedCount}</strong>
                Failed deliveries
              </span>
              <span>
                <strong>
                  {operationStatus.lastProcessedAt
                    ? formatLiveDate(operationStatus.lastProcessedAt, timezone)
                    : "Not yet"}
                </strong>
                Last processed
              </span>
            </div>
          ) : (
            <LiveStateNotice
              kind={operationsQuery.isPending ? "loading" : "failed"}
              title={
                operationsQuery.isPending
                  ? "Loading worker status"
                  : "Worker status is unavailable"
              }
              {...(operationsQuery.isError
                ? {
                    description:
                      "TREVV could not load the background processing status. Try again to check it.",
                  }
                : {})}
              actions={
                operationsQuery.isError ? (
                  <button
                    type="button"
                    onClick={() => void operationsQuery.refetch()}
                  >
                    Retry worker status
                  </button>
                ) : undefined
              }
            />
          )}
          <small className={styles.timestampLine}>
            Workspace updated {formatLiveDate(workspace.updatedAt, timezone)}
            {workspace.nextMilestone
              ? ` · Next milestone ${workspace.nextMilestone.title} on ${formatLiveDateOnly(workspace.nextMilestone.date, timezone)}`
              : ""}
          </small>
        </section>

        {createOpen ? (
          <div
            className="dialog-layer"
            onMouseDown={() => setCreateOpen(false)}
            role="presentation"
          >
            <form
              aria-labelledby="live-board-create-title"
              aria-modal="true"
              className={`capture-dialog ${styles.smallDialog}`}
              data-testid="create-board-dialog"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={createBoard}
              role="dialog"
            >
              <header>
                <span className="attention-icon">
                  <LayoutList size={17} />
                </span>
                <div>
                  <h2 id="live-board-create-title">Create a plan</h2>
                  <p>Plans are durable boards owned by {workspace.name}.</p>
                </div>
                <button
                  aria-label="Close plan creation"
                  onClick={() => setCreateOpen(false)}
                  type="button"
                >
                  <X size={17} />
                </button>
              </header>
              <div className={styles.formBody}>
                {presentedMutationError ? (
                  <LiveStateNotice
                    description={presentedMutationError.description}
                    kind={presentedMutationError.kind}
                    title={presentedMutationError.title}
                  />
                ) : pending ? (
                  <LiveStateNotice
                    description="Success appears only after the server commits the plan."
                    kind="pending"
                    title="Waiting for server confirmation"
                  />
                ) : null}
                <label className={styles.field}>
                  <span>Plan name</span>
                  <input
                    autoFocus
                    maxLength={160}
                    onChange={(event) => {
                      if (mutationError) {
                        setMutationError(null);
                        setIdempotencyKey(crypto.randomUUID());
                      }
                      setBoardName(event.target.value);
                    }}
                    required
                    value={boardName}
                  />
                </label>
                <label className={styles.field}>
                  <span>Description · Optional</span>
                  <textarea
                    maxLength={5000}
                    onChange={(event) => {
                      if (mutationError) {
                        setMutationError(null);
                        setIdempotencyKey(crypto.randomUUID());
                      }
                      setBoardDescription(event.target.value);
                    }}
                    value={boardDescription}
                  />
                </label>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Start date · Optional</span>
                    <input
                      onChange={(event) => {
                        if (mutationError) {
                          setMutationError(null);
                          setIdempotencyKey(crypto.randomUUID());
                        }
                        setBoardStartDate(event.target.value);
                      }}
                      type="date"
                      value={boardStartDate}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>End date · Optional</span>
                    <input
                      min={boardStartDate || undefined}
                      onChange={(event) => {
                        if (mutationError) {
                          setMutationError(null);
                          setIdempotencyKey(crypto.randomUUID());
                        }
                        setBoardEndDate(event.target.value);
                      }}
                      type="date"
                      value={boardEndDate}
                    />
                  </label>
                </div>
              </div>
              <footer>
                <span>Private to authorized organization members.</span>
                <div>
                  <button onClick={() => setCreateOpen(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    disabled={pending || !boardName.trim()}
                    type="submit"
                  >
                    {pending ? (
                      "Waiting for confirmation…"
                    ) : mutationError ? (
                      "Retry same request"
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Create plan
                      </>
                    )}
                  </button>
                </div>
              </footer>
            </form>
          </div>
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}
