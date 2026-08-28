import {
  calculateWorkspaceProgress,
  demoItems,
  demoPortfolios,
  workspacesForPortfolio,
  rollupWorkspace,
  type Workspace,
  type WorkspaceHealth,
  type WorkspaceRollup,
  type Portfolio,
  type WorkItem,
} from "@founderhq/core";
import { NOW, scopeWorkspace } from "./attention";

export interface ProjectSummary {
  workspace: Workspace;
  rollup: WorkspaceRollup;
  progress: number | null;
  blocker: WorkItem | undefined;
}

/** Every project in a portfolio, ranked by how much it needs you. */
export function projectsIn(portfolioId: string, now = NOW): ProjectSummary[] {
  const workspaces = workspacesForPortfolio(portfolioId);
  return workspaces
    .map((workspace) => ({
      workspace,
      rollup: rollupWorkspace(workspace, demoItems, now),
      progress: calculateWorkspaceProgress(workspace),
      // The actual thing that is stuck, not just how many are.
      blocker: demoItems.find(
        (item) =>
          item.workspaceId === workspace.id && item.status === "blocked",
      ),
    }))
    .sort((left, right) => right.rollup.score - left.rollup.score);
}

export interface PortfolioSummary {
  portfolio: Portfolio;
  projects: ProjectSummary[];
  count: number;
  /** Health mix, in severity order, for the stacked bar. */
  health: { key: WorkspaceHealth; label: string; count: number }[];
  attentionCount: number;
  overdue: number;
  blocked: number;
  /** Mean progress across projects that report it. */
  progress: number | null;
  /** The project that most needs attention right now. */
  focus: ProjectSummary | undefined;
}

const HEALTH_ORDER: { key: WorkspaceHealth; label: string }[] = [
  { key: "critical", label: "Critical" },
  { key: "watch", label: "Watch" },
  { key: "on_track", label: "On track" },
  { key: "parked", label: "Parked" },
];

export function summarizePortfolio(
  portfolio: Portfolio,
  now = NOW,
): PortfolioSummary {
  const projects = projectsIn(portfolio.id, now);
  const reporting = projects
    .map((project) => project.progress)
    .filter((value): value is number => value !== null);
  return {
    portfolio,
    projects,
    count: projects.length,
    health: HEALTH_ORDER.map(({ key, label }) => ({
      key,
      label,
      count: projects.filter((project) => project.workspace.health === key)
        .length,
    })),
    attentionCount: scopeWorkspace(portfolio.id, now).attentionCount,
    overdue: projects.reduce((sum, p) => sum + p.rollup.overdue, 0),
    blocked: projects.reduce((sum, p) => sum + p.rollup.blocked, 0),
    progress: reporting.length
      ? Math.round(reporting.reduce((a, b) => a + b, 0) / reporting.length)
      : null,
    focus: projects[0],
  };
}

/** Every portfolio the user can see, summarized for the Portfolio overview. */
export function allPortfolioSummaries(now = NOW): PortfolioSummary[] {
  return demoPortfolios
    .map((portfolio) => summarizePortfolio(portfolio, now))
    .filter((summary) => summary.count > 0);
}
