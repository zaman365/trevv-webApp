"use client";
const SharedPlanningHub = dynamic(
  () => import("./shared-planning-hub").then((m) => m.SharedPlanningHub),
  { loading: () => <p>Loading plans and ideas…</p> },
);
import dynamic from "next/dynamic";
const LiveDashboardPlanCreator = dynamic(
  () =>
    import("./live-dashboard-plan-creator").then(
      (module) => module.LiveDashboardPlanCreator,
    ),
  { loading: () => <p role="status">Loading plan editor…</p> },
);

const LiveRefreshStatus = dynamic(
  () =>
    import("./live-refresh-status").then((module) => module.LiveRefreshStatus),
  { loading: () => <p role="status">Checking workspace connection…</p> },
);
import {
  DashboardTabs,
  DashboardPanel,
  DashboardSectionContent,
  useDashboardSections,
} from "./live-dashboard-sections";

import type { BoardDto } from "@founderhq/api-contract";
import {
  ClipboardCheck,
  Clock3,
  FileQuestion,
  Plus,
  Sparkles,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
const LiveCreateTask = dynamic(
  () => import("./live-create-task").then((module) => module.LiveCreateTask),
  { loading: () => <p role="status">Loading task actions…</p> },
);
const LiveMyWork = dynamic(
  () => import("./live-work-my-work").then((m) => m.LiveMyWork),
  { loading: () => <p>Loading workspace tasks…</p> },
);
import { TrevvApiError } from "@founderhq/api-client";
import { taskToday } from "@/lib/task-views";
import {
  dashboardFocusItems,
  dashboardPlanItems,
  type DashboardFocus,
} from "@/lib/workspace-dashboard";
const WorkspaceDashboardWidgets = dynamic(
  () =>
    import("./workspace-dashboard-widgets").then(
      (module) => module.WorkspaceDashboardWidgets,
    ),
  {
    loading: () => (
      <LiveStateNotice kind="loading" title="Loading workspace progress" />
    ),
  },
);
import dashboardStyles from "./workspace-dashboard.module.css";
import styles from "./live-operating-loop.module.css";

export function LiveWorkspaceDashboard({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { section, visited, select } = useDashboardSections(workspaceSlug);
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
  const [planEditorLoaded, setPlanEditorLoaded] = useState(false);
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

  const presentedLoadError = loadError ? presentLiveError(loadError) : null;

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
              onClick={() => {
                setPlanEditorLoaded(true);
                setCreateOpen(true);
              }}
            >
              <Plus size={15} /> New plan
            </button>
            <LiveCreateTask workspaces={[workspace]} />
          </div>
        </header>
        <DashboardTabs value={section} onChange={select} />

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

        <DashboardPanel
          key={workspace.id}
          section="summary"
          active={section === "summary"}
          workspaceSlug={workspaceSlug}
        >
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
          <SharedPlanningHub
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            compact
          />
          <section className={styles.panel} aria-labelledby="live-loop-title">
            <header>
              <div>
                <p>Keep work moving</p>
                <h2 id="live-loop-title">What needs movement</h2>
              </div>
            </header>
            <nav
              className={`${styles.actionList} ${dashboardStyles.sectionActions}`}
              aria-label="Operating loop views"
            >
              <button type="button" onClick={() => select("attention")}>
                <Sparkles size={16} />
                <span>
                  <strong>Attention</strong>
                  <small>
                    {countLabel(attention.length)} items need attention
                  </small>
                </span>
              </button>
              <button type="button" onClick={() => select("decisions")}>
                <FileQuestion size={16} />
                <span>
                  <strong>Decisions</strong>
                  <small>{countLabel(itemTotals?.decisions ?? 0)} open</small>
                </span>
              </button>
              <button type="button" onClick={() => select("approvals")}>
                <ClipboardCheck size={16} />
                <span>
                  <strong>Approvals</strong>
                  <small>{countLabel(itemTotals?.approvals ?? 0)} open</small>
                </span>
              </button>
              <button type="button" onClick={() => select("waiting")}>
                <Clock3 size={16} />
                <span>
                  <strong>Waiting</strong>
                  <small>{countLabel(waiting.length)} active follow-ups</small>
                </span>
              </button>
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
                      ? formatLiveDate(
                          operationStatus.lastProcessedAt,
                          timezone,
                        )
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
        </DashboardPanel>
        {visited
          .filter((id) => id !== "summary")
          .map((id) => (
            <DashboardPanel
              key={`${workspace.id}:${id}`}
              section={id}
              active={section === id}
              workspaceSlug={workspaceSlug}
            >
              <DashboardSectionContent
                section={id}
                workspaceId={workspace.id}
                workspaceSlug={workspaceSlug}
              />
            </DashboardPanel>
          ))}

        {planEditorLoaded ? (
          <LiveDashboardPlanCreator
            key={workspaceId}
            open={createOpen}
            workspaceId={workspaceId}
            workspaceName={workspace.name}
            onCreated={setConfirmedBoard}
            onClose={() => setCreateOpen(false)}
          />
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}
