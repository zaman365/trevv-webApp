"use client";

import type { WorkspaceDto } from "@founderhq/api-contract";
import {
  AlertTriangle,
  Blocks,
  CheckCircle2,
  FolderKanban,
  Grid2X2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { useWorkspaceState as useWorkspace } from "@/lib/workspace-context";
import {
  openWorkspaceItems,
  workspaceSlugFromName,
} from "@/lib/live-workflow-ui";
import { workspaceHref } from "@/lib/workspace-routes";
import { LiveStateNotice, LiveSyncedAt } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./live-operating-loop.module.css";

type WorkspaceType = WorkspaceDto["type"];

export function LivePortfolioExperience() {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const { portfolioId } = useWorkspace();
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
  const workspaces = portfolio
    ? liveData.workspaces.filter(
        (workspace) => workspace.portfolioId === portfolio.id,
      )
    : liveData.workspaces;
  const portfolioWorkspaceIds = new Set(workspaces.map((item) => item.id));
  const open = liveData.items.filter(
    (item) =>
      portfolioWorkspaceIds.has(item.workspaceId) && item.status !== "done",
  );
  const signals = liveData.attention.filter(
    (signal) =>
      !signal.resolvedAt &&
      !signal.dismissedAt &&
      (!signal.workspaceId || portfolioWorkspaceIds.has(signal.workspaceId)),
  );
  const rollups = useMemo(
    () =>
      new Map(
        workspaces.map((workspace) => {
          const items = openWorkspaceItems(liveData.items, workspace.id);
          return [
            workspace.id,
            {
              open: items.length,
              blocked: items.filter((item) => item.status === "blocked").length,
              decisions: items.filter((item) => item.type === "decision")
                .length,
              approvals: items.filter((item) => item.type === "approval")
                .length,
              attention: signals.filter(
                (signal) => signal.workspaceId === workspace.id,
              ).length,
            },
          ];
        }),
      ),
    [liveData.items, signals, workspaces],
  );

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
      await liveData.refresh();
      setConfirmed(result.data.workspace);
      setFormOpen(false);
      setName("");
      setPriority("");
      setIdempotencyKey(crypto.randomUUID());
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
        <header className={styles.hero}>
          <div>
            <p>Portfolio · {session.organization.name}</p>
            <h1>{portfolio?.name ?? "Your portfolio"}</h1>
            <span>
              Durable workspaces and their current operating signals. Updated in{" "}
              {session.organization.timezone ?? "UTC"}.
            </span>
          </div>
          {portfolio && canCreateWorkspace ? (
            <button
              className="primary-button"
              data-testid="create-workspace-open"
              onClick={() => setFormOpen(true)}
              type="button"
            >
              <Plus size={15} /> Create project / workspace
            </button>
          ) : null}
        </header>

        {liveData.stale ? (
          <LiveStateNotice
            actions={
              <button onClick={() => void liveData.refresh()} type="button">
                Refresh
              </button>
            }
            description="The last-known portfolio remains visible while TREVV reconnects."
            kind="stale"
            synced
            title="Portfolio data may be stale"
          />
        ) : null}
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
            <strong>{open.length}</strong>
            <span>Open work</span>
          </article>
          <article>
            <Blocks size={18} />
            <strong>
              {open.filter((item) => item.status === "blocked").length}
            </strong>
            <span>Blocked</span>
          </article>
          <article>
            <Sparkles size={18} />
            <strong>{signals.length}</strong>
            <span>Need attention</span>
          </article>
        </section>

        <section
          className={styles.panel}
          aria-labelledby="live-workspaces-title"
        >
          <header>
            <div>
              <p>Canonical workspace records</p>
              <h2 id="live-workspaces-title">Workspaces</h2>
            </div>
            <small>
              Last synced{" "}
              <LiveSyncedAt timezone={session.organization.timezone ?? "UTC"} />
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
                const rollup = rollups.get(workspace.id)!;
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
                      {workspace.icon}
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

        {formOpen && portfolio && canCreateWorkspace ? (
          <div
            className="dialog-layer"
            onMouseDown={() => setFormOpen(false)}
            role="presentation"
          >
            <form
              aria-labelledby="live-workspace-create-title"
              aria-modal="true"
              className={`capture-dialog ${styles.smallDialog}`}
              data-testid="create-workspace-dialog"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={createWorkspace}
              role="dialog"
            >
              <header>
                <span className="attention-icon">
                  <FolderKanban size={17} />
                </span>
                <div>
                  <h2 id="live-workspace-create-title">
                    Create a project or workspace
                  </h2>
                  <p>Creates it together with its first plan board.</p>
                </div>
                <button
                  aria-label="Close workspace creation"
                  onClick={() => setFormOpen(false)}
                  type="button"
                >
                  <X size={17} />
                </button>
              </header>
              <div className={styles.formBody}>
                {presentedError ? (
                  <LiveStateNotice
                    description={presentedError.description}
                    kind={presentedError.kind}
                    title={presentedError.title}
                  />
                ) : pending ? (
                  <LiveStateNotice
                    description="TREVV will only show success after the server commits the workspace and first plan."
                    kind="pending"
                    title="Creating workspace and first plan"
                  />
                ) : null}
                <label className={styles.field}>
                  <span>Name</span>
                  <input
                    autoFocus
                    maxLength={160}
                    onChange={(event) => {
                      editForm();
                      setName(event.target.value);
                    }}
                    required
                    value={name}
                  />
                </label>
                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Type</span>
                    <select
                      onChange={(event) => {
                        editForm();
                        setType(event.target.value as WorkspaceType);
                      }}
                      value={type}
                    >
                      {(
                        [
                          "business",
                          "client",
                          "product",
                          "venture",
                          "initiative",
                          "project",
                          "department",
                          "shared_function",
                        ] as const
                      ).map((candidate) => (
                        <option key={candidate} value={candidate}>
                          {candidate.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Current priority</span>
                    <input
                      maxLength={500}
                      onChange={(event) => {
                        editForm();
                        setPriority(event.target.value);
                      }}
                      value={priority}
                    />
                  </label>
                </div>
              </div>
              <footer>
                <span>Portfolio: {portfolio.name}</span>
                <div>
                  <button onClick={() => setFormOpen(false)} type="button">
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    disabled={pending || name.trim().length < 2}
                    type="submit"
                  >
                    {pending ? (
                      "Waiting for confirmation…"
                    ) : error ? (
                      "Retry same request"
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Create project / workspace
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
