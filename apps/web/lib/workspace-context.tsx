"use client";

import { getMessages, type Locale } from "@founderhq/i18n";
import { demoWorkspaces } from "@founderhq/core";
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

type Theme = "light" | "dark";
export type WorkspaceLevel = "portfolio" | "project";

const workspaceSelectionKey = "trevv:workspace-selection";
const portfolioSelectionKey = "trevv:portfolio-selection";

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
  initialPortfolioId = DEFAULT_PORTFOLIO_ID,
  initialProjectId,
  portfolioScoped = false,
}: {
  children: ReactNode;
  initialPortfolioId?: string;
  initialProjectId?: string;
  /** Report across the whole portfolio even while a workspace is selected. */
  portfolioScoped?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [portfolioId, setPortfolioState] = useState(initialPortfolioId);
  const [workspaceLevel, setWorkspaceLevel] = useState<WorkspaceLevel>(
    initialProjectId ? "project" : "portfolio",
  );
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const customWorkspaceRecords = useCustomWorkspaces();
  const customWorkspaces = useMemo(
    () => customWorkspaceRecords.map((record) => record.workspace),
    [customWorkspaceRecords],
  );

  useEffect(() => {
    if (selectionHydrated) return;
    const frame = window.requestAnimationFrame(() => {
      if (!initialProjectId) {
        // Every surface rehydrates the same selection, so visiting the
        // portfolio and returning keeps the member's workspace.
        const workspaces = [...customWorkspaces, ...demoWorkspaces];
        // A workspace-scoped surface needs some workspace to report on;
        // the portfolio must not invent one the member never chose.
        const fallbackFor = (candidatePortfolioId: string) =>
          portfolioScoped
            ? undefined
            : workspaces.find(
                (project) => project.portfolioId === candidatePortfolioId,
              );
        try {
          const stored = JSON.parse(
            localStorage.getItem(workspaceSelectionKey) ?? "null",
          ) as unknown;
          const selection =
            stored && typeof stored === "object"
              ? (stored as { portfolioId?: unknown; projectId?: unknown })
              : undefined;
          const storedPortfolioId =
            typeof selection?.portfolioId === "string"
              ? selection.portfolioId
              : (localStorage.getItem(portfolioSelectionKey) ??
                initialPortfolioId);
          const storedProjectId =
            typeof selection?.projectId === "string"
              ? selection.projectId
              : undefined;
          const storedProject = workspaces.find(
            (project) => project.id === storedProjectId,
          );
          const nextProject =
            storedProject?.portfolioId === storedPortfolioId
              ? storedProject
              : fallbackFor(storedPortfolioId);

          setPortfolioState(nextProject?.portfolioId ?? storedPortfolioId);
          if (nextProject) {
            setWorkspaceLevel("project");
            setProjectId(nextProject.id);
          }
        } catch {
          const fallbackProject = fallbackFor(initialPortfolioId);
          if (fallbackProject) {
            setWorkspaceLevel("project");
            setProjectId(fallbackProject.id);
          }
        }
      }
      setSelectionHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    customWorkspaces,
    initialPortfolioId,
    initialProjectId,
    portfolioScoped,
    selectionHydrated,
  ]);

  useEffect(() => {
    if (!selectionHydrated) return;
    try {
      localStorage.setItem(portfolioSelectionKey, portfolioId);
      if (workspaceLevel === "project" && projectId) {
        localStorage.setItem(
          workspaceSelectionKey,
          JSON.stringify({ level: "project", portfolioId, projectId }),
        );
      }
    } catch {
      // Selection still works for the current page when storage is unavailable.
    }
  }, [portfolioId, projectId, selectionHydrated, workspaceLevel]);

  const setPortfolioId = useCallback(
    (id: string) => {
      // Switching portfolios is the only thing that clears the workspace.
      // Re-selecting the current one leaves the selection alone.
      const switchingPortfolio = id !== portfolioId;
      setPortfolioState(id);
      if (switchingPortfolio) {
        setWorkspaceLevel("portfolio");
        setProjectId(null);
      }
      try {
        localStorage.setItem(portfolioSelectionKey, id);
        if (switchingPortfolio) localStorage.removeItem(workspaceSelectionKey);
      } catch {
        // The selection still applies for the current session.
      }
    },
    [portfolioId],
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
        portfolioId,
        NOW,
        // The portfolio reports across every workspace even while one
        // stays selected in the switcher.
        !portfolioScoped && workspaceLevel === "project"
          ? (projectId ?? undefined)
          : undefined,
        customWorkspaces,
      ),
    [customWorkspaces, portfolioId, portfolioScoped, projectId, workspaceLevel],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      locale,
      toggleLocale,
      theme,
      toggleTheme,
      copy: getMessages(locale),
      portfolioId,
      setPortfolioId,
      workspaceLevel,
      projectId,
      selectProject,
      scope,
      dashboardAccess: DEMO_DASHBOARD_ACCESS,
      captureOpen,
      setCaptureOpen,
    }),
    [
      captureOpen,
      locale,
      portfolioId,
      projectId,
      scope,
      selectProject,
      setPortfolioId,
      theme,
      toggleLocale,
      toggleTheme,
      workspaceLevel,
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
