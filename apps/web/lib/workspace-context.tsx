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
import { useCustomHubs } from "./custom-hubs";

type Theme = "light" | "dark";
export type WorkspaceLevel = "portfolio" | "project";

const workspaceSelectionKey = "trevv:workspace-selection";

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
}: {
  children: ReactNode;
  initialPortfolioId?: string;
  initialProjectId?: string;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<Theme>("light");
  const [portfolioId, setPortfolioState] = useState(initialPortfolioId);
  const [workspaceLevel, setWorkspaceLevel] =
    useState<WorkspaceLevel>(initialProjectId ? "project" : "portfolio");
  const [projectId, setProjectId] = useState<string | null>(
    initialProjectId ?? null,
  );
  const [selectionHydrated, setSelectionHydrated] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const customHubRecords = useCustomHubs();
  const customHubs = useMemo(
    () => customHubRecords.map((record) => record.hub),
    [customHubRecords],
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (!initialProjectId) {
        try {
          const stored = JSON.parse(
            localStorage.getItem(workspaceSelectionKey) ?? "null",
          ) as unknown;
          if (stored && typeof stored === "object") {
            const selection = stored as {
              portfolioId?: unknown;
              projectId?: unknown;
              level?: unknown;
            };
            if (typeof selection.portfolioId === "string")
              setPortfolioState(selection.portfolioId);
            if (
              selection.level === "project" &&
              typeof selection.projectId === "string"
            ) {
              setWorkspaceLevel("project");
              setProjectId(selection.projectId);
            }
          }
        } catch {
          // The default portfolio remains available when preferences are blocked.
        }
      }
      setSelectionHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialProjectId]);

  useEffect(() => {
    if (!selectionHydrated) return;
    try {
      localStorage.setItem(
        workspaceSelectionKey,
        JSON.stringify({
          level: workspaceLevel,
          portfolioId,
          projectId: workspaceLevel === "project" ? projectId : null,
        }),
      );
    } catch {
      // Selection still works for the current page when storage is unavailable.
    }
  }, [portfolioId, projectId, selectionHydrated, workspaceLevel]);

  const setPortfolioId = useCallback((id: string) => {
    setPortfolioState(id);
    setWorkspaceLevel("portfolio");
    setProjectId(null);
  }, []);

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
        workspaceLevel === "project" ? (projectId ?? undefined) : undefined,
        customHubs,
      ),
    [customHubs, portfolioId, projectId, workspaceLevel],
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
