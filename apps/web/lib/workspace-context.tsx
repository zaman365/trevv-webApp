"use client";

import { getMessages, type Locale } from "@founderhq/i18n";
import { demoHubs } from "@founderhq/core";
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
  restoreStoredProject = true,
}: {
  children: ReactNode;
  initialPortfolioId?: string;
  initialProjectId?: string;
  restoreStoredProject?: boolean;
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
  const customHubRecords = useCustomHubs();
  const customHubs = useMemo(
    () => customHubRecords.map((record) => record.hub),
    [customHubRecords],
  );

  useEffect(() => {
    if (selectionHydrated) return;
    const frame = window.requestAnimationFrame(() => {
      if (!initialProjectId) {
        try {
          if (restoreStoredProject) {
            const stored = JSON.parse(
              localStorage.getItem(workspaceSelectionKey) ?? "null",
            ) as unknown;
            const selection =
              stored && typeof stored === "object"
                ? (stored as {
                    portfolioId?: unknown;
                    projectId?: unknown;
                  })
                : undefined;
            const storedPortfolioId =
              typeof selection?.portfolioId === "string"
                ? selection.portfolioId
                : initialPortfolioId;
            const storedProjectId =
              typeof selection?.projectId === "string"
                ? selection.projectId
                : undefined;
            const storedProject = [...customHubs, ...demoHubs].find(
              (project) => project.id === storedProjectId,
            );
            const fallbackProject = [...customHubs, ...demoHubs].find(
              (project) => project.portfolioId === storedPortfolioId,
            );
            const nextProject =
              storedProject?.portfolioId === storedPortfolioId
                ? storedProject
                : fallbackProject;

            setPortfolioState(nextProject?.portfolioId ?? storedPortfolioId);
            if (nextProject) {
              setWorkspaceLevel("project");
              setProjectId(nextProject.id);
            }
          } else {
            const storedPortfolioId = localStorage.getItem(
              portfolioSelectionKey,
            );
            if (storedPortfolioId) setPortfolioState(storedPortfolioId);
          }
        } catch {
          if (restoreStoredProject) {
            const fallbackProject = [...customHubs, ...demoHubs].find(
              (project) => project.portfolioId === initialPortfolioId,
            );
            if (fallbackProject) {
              setWorkspaceLevel("project");
              setProjectId(fallbackProject.id);
            }
          }
        }
      }
      setSelectionHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    customHubs,
    initialPortfolioId,
    initialProjectId,
    restoreStoredProject,
    selectionHydrated,
  ]);

  useEffect(() => {
    if (!selectionHydrated) return;
    try {
      if (restoreStoredProject) {
        if (workspaceLevel !== "project" || !projectId) return;
        localStorage.setItem(
          workspaceSelectionKey,
          JSON.stringify({
            level: "project",
            portfolioId,
            projectId,
          }),
        );
      } else {
        localStorage.setItem(portfolioSelectionKey, portfolioId);
      }
    } catch {
      // Selection still works for the current page when storage is unavailable.
    }
  }, [
    portfolioId,
    projectId,
    restoreStoredProject,
    selectionHydrated,
    workspaceLevel,
  ]);

  const setPortfolioId = useCallback((id: string) => {
    setPortfolioState(id);
    setWorkspaceLevel("portfolio");
    setProjectId(null);
    try {
      localStorage.setItem(portfolioSelectionKey, id);
    } catch {
      // The selection still applies for the current session.
    }
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
