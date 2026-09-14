"use client";
import { WorkspaceMark } from "./workspace-mark";
import { PortfolioPageSections } from "./portfolio-page-sections";

import { LiveRefreshStatus } from "./live-refresh-status";

import type { WorkspaceDto } from "@founderhq/api-contract";
import {
  AlertTriangle,
  Blocks,
  FolderKanban,
  Grid2X2,
  Plus,
  Sparkles,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useMemo, useState, type FormEvent } from "react";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import { workspaceSlugFromName } from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice, LiveSyncedAt } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import dynamic from "next/dynamic";
const LiveCreateTask = dynamic(
  () => import("./live-create-task").then((module) => module.LiveCreateTask),
  { loading: () => <p role="status">Loading task actions…</p> },
);
import styles from "./live-operating-loop.module.css";

const LivePortfolioCreateForm = dynamic(
  () =>
    import("./live-portfolio-create-form").then(
      (module) => module.LivePortfolioCreateForm,
    ),
  { loading: () => <p role="status">Loading workspace creation…</p> },
);

type WorkspaceType = WorkspaceDto["type"];

export function LivePortfolioExperience() {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const { portfolioId } = useWorkspace();
  useReportRouteReady(liveData.recordsReady);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<WorkspaceType>("project");
  const [priority, setPriority] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [confirmed, setConfirmed] = useState<WorkspaceDto | null>(null);
  const portfolio =
    liveData.portfolios.find((record) => record.id === portfolioId) ??
    liveData.portfolios.find((record) => record.isDefault) ??
    liveData.portfolios[0];
  const canCreateWorkspace = ["owner", "admin"].includes(
    session.organization.role,
  );
  const workspaces = useMemo(
    () =>
      portfolio
        ? liveData.workspaces.filter(
            (workspace) => workspace.portfolioId === portfolio.id,
          )
        : liveData.workspaces,
    [liveData.workspaces, portfolio],
  );
  const rollups = useMemo(
    () =>
      new Map(
        liveData.summary?.workspaces.map((row) => [row.workspaceId, row]) ?? [],
      ),
    [liveData.summary],
  );
  const openCount = useMemo(
    () =>
      workspaces.reduce(
        (sum, workspace) => sum + (rollups.get(workspace.id)?.open ?? 0),
        0,
      ),
    [workspaces, rollups],
  );
  const blockedCount = useMemo(
    () =>
      workspaces.reduce(
        (sum, workspace) => sum + (rollups.get(workspace.id)?.blocked ?? 0),
        0,
      ),
    [workspaces, rollups],
  );
  const attentionCount =
    liveData.summary?.portfolios.find(
      (row) => row.portfolioId === portfolio?.id,
    )?.attention ?? 0;

  function editForm() {
    if (error) {
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!portfolio || !name.trim() || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await liveData.client.createWorkspace(
        {
          portfolioId: portfolio.id,
          name: name.trim(),
          slug: workspaceSlugFromName(
            name,
            liveData.workspaces.map((workspace) => workspace.slug),
          ),
          description: "",
          type,
          accent: "#5b56db",
          icon: name.trim().slice(0, 1).toLocaleUpperCase(),
          stage: "idea",
          health: "on_track",
          healthNote: "",
          priority: priority.trim(),
          initialBoardName: `${name.trim()} Plan`,
        },
        idempotencyKey,
      );
      setConfirmed(result.data.workspace);
      setFormOpen(false);
      setName("");
      setPriority("");
      setIdempotencyKey(crypto.randomUUID());
      void liveData.refresh();
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presentedError = error ? presentLiveError(error) : null;

  return (
    <WorkspaceFrame active="portfolio">
      <main className={styles.main} data-testid="live-portfolio">
        <header className={`${styles.hero} compact-page-header`}>
          <div>
            <h1>{portfolio?.name ?? "Your portfolio"}</h1>
          </div>
          {portfolio && canCreateWorkspace ? (
            <button
              className="primary-button"
              data-testid="create-workspace-open"
              onClick={() => setFormOpen(true)}
              type="button"
            >
              <Plus size={15} /> Create Workspace
            </button>
          ) : null}
        </header>

        <PortfolioPageSections portfolioId={portfolio?.id ?? ""}>
          <section className={styles.panel} aria-label="Start your day">
            <header>
              <div>
                <p>Start here</p>
                <h2>Turn plans into finished work</h2>
              </div>
              <Link href="/app/my-work">Open all my work →</Link>
            </header>
            <p>
              Use a workspace for each startup, business, or client. Add project
              boards, invite your team, and keep tasks and conversations
              together.
            </p>
            <LiveCreateTask workspaces={workspaces} />
          </section>

          <LiveRefreshStatus />
          {confirmed ? (
            <LiveStateNotice
              actions={
                <Link href={workspaceHref(confirmed.slug)}>Open workspace</Link>
              }
              description="The project or workspace and its first plan board are durable and available to authorized organization members."
              kind="saved"
              title={`Server confirmed “${confirmed.name}”`}
            />
          ) : null}

          <section className={styles.statGrid} aria-label="Portfolio totals">
            <article>
              <FolderKanban size={18} />
              <strong>{workspaces.length}</strong>
              <span>Workspaces</span>
            </article>
            <article>
              <Grid2X2 size={18} />
              <strong>{openCount}</strong>
              <span>Open work</span>
            </article>
            <article>
              <Blocks size={18} />
              <strong>{blockedCount}</strong>
              <span>Blocked</span>
            </article>
            <article>
              <Sparkles size={18} />
              <strong>{attentionCount}</strong>
              <span>Need attention</span>
            </article>
          </section>

          <section
            className={styles.panel}
            aria-labelledby="live-workspaces-title"
          >
            <header>
              <div>
                <p>Startups, businesses, clients, and projects</p>
                <h2 id="live-workspaces-title">Workspaces</h2>
              </div>
              <small>
                Last synced{" "}
                <LiveSyncedAt
                  timezone={session.organization.timezone ?? "UTC"}
                />
              </small>
            </header>
            {workspaces.length === 0 ? (
              <LiveStateNotice
                actions={
                  portfolio && canCreateWorkspace ? (
                    <button onClick={() => setFormOpen(true)} type="button">
                      Create the first workspace
                    </button>
                  ) : null
                }
                description={
                  canCreateWorkspace
                    ? "Create a workspace to start the founder operating loop."
                    : "You do not have access to a Workspace yet. Ask an organization owner or admin to assign one."
                }
                kind="empty"
                title={
                  canCreateWorkspace
                    ? "No workspaces yet"
                    : "No Workspace access yet"
                }
              />
            ) : (
              <div className={styles.cardGrid}>
                {workspaces.map((workspace) => {
                  const rollup = rollups.get(workspace.id) ?? {
                    open: 0,
                    blocked: 0,
                    attention: 0,
                  };
                  return (
                    <Link
                      className={styles.workspaceCard}
                      data-testid={`workspace-card-${workspace.slug}`}
                      href={workspaceHref(workspace.slug)}
                      key={workspace.id}
                    >
                      <span
                        className={styles.workspaceMark}
                        style={{
                          background: `${workspace.accent}18`,
                          color: workspace.accent,
                        }}
                      >
                        <WorkspaceMark workspace={workspace} />
                      </span>
                      <div>
                        <p>
                          {workspace.type.replaceAll("_", " ")} ·{" "}
                          {workspace.stage}
                        </p>
                        <h3>{workspace.name}</h3>
                        <span>
                          {workspace.priority || "No priority recorded"}
                        </span>
                      </div>
                      <dl>
                        <div>
                          <dt>Open</dt>
                          <dd>{rollup.open}</dd>
                        </div>
                        <div>
                          <dt>Blocked</dt>
                          <dd>{rollup.blocked}</dd>
                        </div>
                        <div>
                          <dt>Attention</dt>
                          <dd>{rollup.attention}</dd>
                        </div>
                      </dl>
                      {workspace.health !== "on_track" ? (
                        <span className={styles.healthFlag}>
                          <AlertTriangle size={13} />
                          {workspace.health.replaceAll("_", " ")}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </PortfolioPageSections>

        {formOpen && portfolio && canCreateWorkspace ? (
          <LivePortfolioCreateForm
            portfolioName={portfolio.name}
            name={name}
            type={type}
            priority={priority}
            pending={pending}
            error={error}
            presentedError={presentedError}
            editForm={editForm}
            setName={setName}
            setType={setType}
            setPriority={setPriority}
            onClose={() => setFormOpen(false)}
            createWorkspace={createWorkspace}
          />
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}
