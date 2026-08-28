"use client";

import { getMessages, type Locale } from "@founderhq/i18n";
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
  captureOpen: boolean;
  setCaptureOpen: (open: boolean) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  routePortfolioId,
  routeProjectId,
  storedSelection,
  portfolioScoped = false,
}: {
  children: ReactNode;
  /** Workspace named by the current route, when the route names one. */
  routePortfolioId?: string;
  routeProjectId?: string;
  /** Selection read from the cookie on the server, so SSR paints it. */
  storedSelection?: StoredWorkspaceSelection;
  /** Report across the whole portfolio even while a workspace is selected. */
  portfolioScoped?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [portfolioId, setPortfolioState] = useState(
    routePortfolioId ?? storedSelection?.portfolioId ?? DEFAULT_PORTFOLIO_ID,
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

  // The shell outlives navigation, so a route naming a workspace wins over
  // the remembered one. Deriving this during render rather than syncing it
  // in an effect keeps navigation to a single pass — the second pass is
  // what showed up as a flicker in the switcher.
  const activeProjectId = routeProjectId ?? projectId;
  const activePortfolioId = routeProjectId
    ? (routePortfolioId ?? portfolioId)
    : portfolioId;
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
      scopeWorkspace(
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
      dashboardAccess: DEMO_DASHBOARD_ACCESS,
      captureOpen,
      setCaptureOpen,
    }),
    [
      activePortfolioId,
      activeProjectId,
      activeWorkspaceLevel,
      captureOpen,
      locale,
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
