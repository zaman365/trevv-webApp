"use client";

import { getMessages, type Locale } from "@founderhq/i18n";
import type {
  AttentionSignal,
  Portfolio,
  WaitingState,
  WorkItem,
  Workspace,
} from "@founderhq/core";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PORTFOLIO_ID,
  NOW,
  scopeWorkspace,
  scopeWorkspaceFromData,
  type WorkspaceScope,
} from "./attention";
import {
  DEMO_DASHBOARD_ACCESS,
  type DashboardAccess,
} from "./dashboard-access";
import { useCustomWorkspaces } from "./custom-workspaces";
import {
  writeWorkspaceSelection,
  type StoredWorkspaceSelection,
} from "./workspace-selection";

type Theme = "light" | "dark";
export type WorkspaceLevel = "portfolio" | "project";

interface WorkspaceContextValue {
  locale: Locale;
  toggleLocale: () => void;
  theme: Theme;
  toggleTheme: () => void;
  copy: ReturnType<typeof getMessages>;
  portfolioId: string;
  setPortfolioId: (id: string) => void;
  workspaceLevel: WorkspaceLevel;
  projectId: string | null;
  selectProject: (projectId: string, portfolioId: string) => void;
  /** Derived once, read by every surface. See lib/attention.ts. */
  scope: WorkspaceScope;
  /** Reporting levels and entities the signed-in member may inspect. */
  dashboardAccess: DashboardAccess;
  dataMode: "demo" | "live";
  allPortfolios: readonly Portfolio[];
  allWorkspaces: readonly Workspace[];
  allItems: readonly WorkItem[];
  lastRefreshedAt?: string;
  captureOpen: boolean;
  setCaptureOpen: (open: boolean) => void;
}

export interface WorkspaceLiveSource {
  portfolios: readonly Portfolio[];
  workspaces: readonly Workspace[];
  items: readonly WorkItem[];
  waiting: readonly WaitingState[];
  attention: readonly AttentionSignal[];
  refreshedAt: string;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  routePortfolioId,
  routeProjectId,
  storedSelection,
  portfolioScoped = false,
  liveSource,
}: {
  children: ReactNode;
  /** Workspace named by the current route, when the route names one. */
  routePortfolioId?: string;
  routeProjectId?: string;
  /** Selection read from the cookie on the server, so SSR paints it. */
  storedSelection?: StoredWorkspaceSelection;
  /** Report across the whole portfolio even while a workspace is selected. */
  portfolioScoped?: boolean;
  liveSource?: WorkspaceLiveSource;
}) {
  const defaultPortfolioId =
    liveSource?.portfolios.find((portfolio) => portfolio.isDefault)?.id ??
    liveSource?.portfolios[0]?.id ??
    DEFAULT_PORTFOLIO_ID;
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [portfolioId, setPortfolioState] = useState(
    routePortfolioId ?? storedSelection?.portfolioId ?? defaultPortfolioId,
  );
  const [workspaceLevel, setWorkspaceLevel] = useState<WorkspaceLevel>(
    (routeProjectId ?? storedSelection?.projectId) ? "project" : "portfolio",
  );
  const [projectId, setProjectId] = useState<string | null>(
    routeProjectId ?? storedSelection?.projectId ?? null,
  );
  const [captureOpen, setCaptureOpen] = useState(false);
  const customWorkspaceRecords = useCustomWorkspaces();
  const customWorkspaces = useMemo(
    () => customWorkspaceRecords.map((record) => record.workspace),
    [customWorkspaceRecords],
  );
  const allWorkspaces = liveSource?.workspaces ?? customWorkspaces;

  // The shell outlives navigation, so a route naming a workspace wins over
  // the remembered one. Deriving this during render rather than syncing it
  // in an effect keeps navigation to a single pass — the second pass is
  // what showed up as a flicker in the switcher.
  const requestedProjectId = routeProjectId ?? projectId;
  const requestedPortfolioId = routeProjectId
    ? (routePortfolioId ?? portfolioId)
    : portfolioId;
  const activePortfolioId =
    liveSource &&
    !liveSource.portfolios.some(({ id }) => id === requestedPortfolioId)
      ? defaultPortfolioId
      : requestedPortfolioId;
  const activeProjectId =
    liveSource &&
    requestedProjectId &&
    !liveSource.workspaces.some(
      ({ id, portfolioId: ownerPortfolioId }) =>
        id === requestedProjectId && ownerPortfolioId === activePortfolioId,
    )
      ? null
      : requestedProjectId;
  const activeWorkspaceLevel: WorkspaceLevel = routeProjectId
    ? "project"
    : workspaceLevel;

  useEffect(() => {
    writeWorkspaceSelection({
      portfolioId: activePortfolioId,
      ...(activeWorkspaceLevel === "project" && activeProjectId
        ? { projectId: activeProjectId }
        : {}),
    });
  }, [activePortfolioId, activeProjectId, activeWorkspaceLevel]);

  const setPortfolioId = useCallback(
    (id: string) => {
      // Switching portfolios is the only thing that clears the workspace.
      // Re-selecting the current one leaves the selection alone.
      const switchingPortfolio = id !== activePortfolioId;
      setPortfolioState(id);
      if (switchingPortfolio) {
        setWorkspaceLevel("portfolio");
        setProjectId(null);
      }
      writeWorkspaceSelection({ portfolioId: id });
    },
    [activePortfolioId],
  );

  const selectProject = useCallback(
    (nextProjectId: string, nextPortfolioId: string) => {
      setPortfolioState(nextPortfolioId);
      setProjectId(nextProjectId);
      setWorkspaceLevel("project");
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const toggleLocale = useCallback(
    () => setLocale((current) => (current === "en" ? "de" : "en")),
    [],
  );

  const scope = useMemo(
    () =>
      liveSource
        ? scopeWorkspaceFromData(
            activePortfolioId,
            new Date(),
            liveSource,
            !portfolioScoped && activeWorkspaceLevel === "project"
              ? (activeProjectId ?? undefined)
              : undefined,
          )
        : scopeWorkspace(
            activePortfolioId,
            NOW,
            // The portfolio reports across every workspace even while one
            // stays selected in the switcher.
            !portfolioScoped && activeWorkspaceLevel === "project"
              ? (activeProjectId ?? undefined)
              : undefined,
            customWorkspaces,
          ),
    [
      activePortfolioId,
      activeProjectId,
      activeWorkspaceLevel,
      customWorkspaces,
      liveSource,
      portfolioScoped,
    ],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      locale,
      toggleLocale,
      theme,
      toggleTheme,
      copy: getMessages(locale),
      portfolioId: activePortfolioId,
      setPortfolioId,
      workspaceLevel: activeWorkspaceLevel,
      projectId: activeProjectId,
      selectProject,
      scope,
      dashboardAccess: liveSource
        ? {
            portfolioIds: liveSource.portfolios.map(({ id }) => id),
            projectIds: liveSource.workspaces.map(({ id }) => id),
            teamIds: [],
            personal: true,
          }
        : DEMO_DASHBOARD_ACCESS,
      dataMode: liveSource ? "live" : "demo",
      allPortfolios: liveSource?.portfolios ?? [],
      allWorkspaces,
      allItems: liveSource?.items ?? [],
      ...(liveSource ? { lastRefreshedAt: liveSource.refreshedAt } : {}),
      captureOpen,
      setCaptureOpen,
    }),
    [
      activePortfolioId,
      activeProjectId,
      activeWorkspaceLevel,
      captureOpen,
      locale,
      allWorkspaces,
      liveSource,
      scope,
      selectProject,
      setPortfolioId,
      theme,
      toggleLocale,
      toggleTheme,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside a WorkspaceProvider");
  }
  return value;
}
