"use client";

import { demoWorkspaces } from "@founderhq/core";
import { usePathname } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { useCustomWorkspaces } from "@/lib/custom-workspaces";
import { WorkspaceProvider } from "@/lib/workspace-context";
import type { StoredWorkspaceSelection } from "@/lib/workspace-selection";
import {
  AppSessionProvider,
  type AppSessionView,
} from "@/lib/app-session-context";
import { LearningCenterProvider } from "./learning-center";

const workspaceSlugFrom = (pathname: string) => {
  const match = /^\/app\/workspaces\/([^/]+)/.exec(pathname);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
};

/**
 * Providers live above the router so moving between the portfolio and a
 * workspace re-renders the page, not the whole shell. Mounting them per
 * page meant every navigation threw away the selection and re-read it
 * from storage a frame later, which showed as a flicker in the switcher.
 */
export function AppShellProviders({
  children,
  session,
  storedSelection,
}: {
  children: ReactNode;
  session: AppSessionView;
  storedSelection?: StoredWorkspaceSelection;
}) {
  const pathname = usePathname() ?? "";
  const customWorkspaceRecords = useCustomWorkspaces();
  const routeProject = useMemo(() => {
    const slug = workspaceSlugFrom(pathname);
    if (!slug) return undefined;
    return [
      ...customWorkspaceRecords.map((record) => record.workspace),
      ...demoWorkspaces,
    ].find((workspace) => workspace.slug === slug);
  }, [customWorkspaceRecords, pathname]);

  return (
    <AppSessionProvider session={session}>
      <WorkspaceProvider
        portfolioScoped={pathname === "/app/portfolio"}
        {...(storedSelection ? { storedSelection } : {})}
        {...(routeProject
          ? {
              routePortfolioId: routeProject.portfolioId,
              routeProjectId: routeProject.id,
            }
          : {})}
      >
        <LearningCenterProvider>{children}</LearningCenterProvider>
      </WorkspaceProvider>
    </AppSessionProvider>
  );
}
