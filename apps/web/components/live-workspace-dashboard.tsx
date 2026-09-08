"use client";

import { LiveRefreshStatus } from "./live-refresh-status";

import type { BoardDto } from "@founderhq/api-contract";
import {
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileQuestion,
  Inbox,
  LayoutList,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { workspaceRollups } from "@/lib/collection-index";
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
import { TrevvApiError } from "@founderhq/api-client";
import { taskToday } from "@/lib/task-views";
import {
  dashboardFocusItems,
  dashboardPlanItems,
  type DashboardFocus,
} from "@/lib/workspace-dashboard";
import { WorkspaceDashboardWidgets } from "./workspace-dashboard-widgets";
import dashboardStyles from "./workspace-dashboard.module.css";
import styles from "./live-operating-loop.module.css";

export function LiveWorkspaceDashboard({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const timezone = session.organization.timezone ?? "UTC";
  const [today, setToday] = useState(() => taskToday(timezone));
  const [selectedPlan, setSelectedPlan] = useState("");
  const [ownership, setOwnership] = useState("all");
  const [days, setDays] = useState(14);
  const [focus, setFocus] = useState<DashboardFocus>({
    kind: "all",
    label: "All workspace work",
  });
  useEffect(() => {
    const update = () => setToday(taskToday(timezone));
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [timezone]);
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
  const itemTotals = useMemo(
    () => workspaceRollups(items, []).get(workspace?.id ?? ""),
    [items, workspace?.id],
  );
  const plan = boards.find((board) => board.id === selectedPlan);
  const scopeItems = useMemo(() => {
    const records = plan ? dashboardPlanItems(items, plan) : items;
    return ownership === "mine"
      ? records.filter((item) =>
          item.assignees.some((person) => person.id === session.user.id),
        )
      : records;
  }, [items, plan, ownership, session.user.id]);
  const sourceItems = useMemo(
    () => dashboardFocusItems(scopeItems, focus, today),
    [scopeItems, focus, today],
  );
  function focusWork(next: DashboardFocus) {
    setFocus(next);
    requestAnimationFrame(() => {
      const section = document.getElementById("dashboard-source-work");
      section?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      section?.focus({ preventScroll: true });
    });
  }
  const countLabel = (value: number) =>
    liveData.recordsComplete ? value : `${value} loaded`;
  if (!workspace) {
    return (
      <WorkspaceFrame active="dashboard">
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

  if (
    loadError instanceof TrevvApiError &&
    [401, 403, 404].includes(loadError.status)
  ) {
    return (
      <WorkspaceFrame active="dashboard" workspaceSlug={workspaceSlug}>
        <main className={styles.main}>
          <LiveStateNotice
            kind="permission-loss"
            title="Dashboard access changed"
            description="Your saved workspace data is hidden until access can be verified."
            actions={
              <button type="button" onClick={() => void boardsQuery.refetch()}>
                Check access again
              </button>
            }
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
    <WorkspaceFrame active="dashboard" workspaceSlug={workspaceSlug}>
      <main
        className={`${styles.main} ${dashboardStyles.dashboard}`}
        data-testid="live-dashboard"
      >
        <header className={dashboardStyles.hero}>
          <div>
            <p>{workspace.name} / Your workspace</p>
            <h1>Dashboard</h1>
            <p className={dashboardStyles.heroText}>
              {workspace.priority ||
                workspace.description ||
                "A clear view of progress, people and the work that needs your attention."}
            </p>
          </div>
          <div className={dashboardStyles.heroActions}>
            <button
              className="quiet-button"
              data-testid="create-board-open"
              type="button"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={15} /> New plan
            </button>
            <LiveCreateTask workspaces={[workspace]} />
          </div>
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

        <LiveRefreshStatus />
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
            description="Your plan is ready. Add tasks, owners and milestones to start tracking progress."
            kind="saved"
            title={`Server confirmed “${confirmedBoard.name}”`}
          />
        ) : null}

        <div
          className={dashboardStyles.toolbar}
          role="group"
          aria-label="Dashboard filters"
        >
          <label>
            Project or cycle
            <select
              aria-label="Dashboard project"
              value={plan?.id ?? ""}
              onChange={(event) => {
                setSelectedPlan(event.target.value);
                setFocus({ kind: "all", label: "All work in this scope" });
              }}
            >
              <option value="">All projects</option>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            People
            <select
              aria-label="Dashboard people"
              value={ownership}
              onChange={(event) => {
                setOwnership(event.target.value);
                setFocus({ kind: "all", label: "All work in this scope" });
              }}
            >
              <option value="all">Everyone</option>
              <option value="mine">Assigned to me</option>
            </select>
          </label>
          <label>
            Deadline window
            <select
              aria-label="Dashboard deadline window"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
          </label>
          <span data-stale={liveData.stale}>
            {liveData.stale
              ? "Showing saved data"
              : "Connected to your workspace"}
          </span>
        </div>
        {loadingBoards && (
          <LiveStateNotice kind="loading" title="Loading project plans" />
        )}
        {liveData.recordsReady ? (
          <WorkspaceDashboardWidgets
            items={scopeItems}
            boards={plan ? [plan] : boards}
            workspaceSlug={workspaceSlug}
            timezone={timezone}
            today={today}
            days={days}
            complete={liveData.recordsComplete && boardsQuery.isSuccess}
            plansLoaded={boardsQuery.data !== undefined}
            onFocus={focusWork}
          />
        ) : (
          <LiveStateNotice kind="loading" title="Loading dashboard work" />
        )}
        <section className={styles.panel} aria-labelledby="live-loop-title">
          <header>
            <div>
              <p>Keep work moving</p>
              <h2 id="live-loop-title">What needs movement</h2>
            </div>
          </header>
          <nav className={styles.actionList} aria-label="Operating loop views">
            <Link href={workspaceHref(workspace.slug, "attention")}>
              <Sparkles size={16} />
              <span>
                <strong>Attention</strong>
                <small>
                  {countLabel(attention.length)} items need attention
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

        <div
          id="dashboard-source-work"
          tabIndex={-1}
          className={dashboardStyles.source}
        >
          <div className={dashboardStyles.sourceHeader}>
            <p>
              <strong>{focus.label}</strong> · {sourceItems.length} items
              {!liveData.recordsComplete ? " loaded" : ""}
            </p>
            {focus.kind !== "all" && (
              <button
                type="button"
                onClick={() =>
                  setFocus({ kind: "all", label: "All work in this scope" })
                }
              >
                Clear chart filter
              </button>
            )}
          </div>
          <LiveMyWork
            key={`${plan?.id ?? "all"}:${ownership}:${focus.kind}:${"key" in focus ? focus.key : ""}`}
            items={sourceItems}
            workspaceSlug={workspaceSlug}
            assignedToMe={false}
            title="Workspace tasks"
            initialPeriod="all"
          />
        </div>

        <section
          className={styles.panel}
          aria-labelledby="live-operations-title"
        >
          <header>
            <div>
              <p>Background updates</p>
              <h2 id="live-operations-title">Update delivery</h2>
            </div>
          </header>
          {operationStatus ? (
            <div className={styles.operationsRow}>
              <span>
                <strong>{operationStatus.pendingOutbox}</strong>
                Updates waiting
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
                  <p>Organize tasks and milestones for {workspace.name}.</p>
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
