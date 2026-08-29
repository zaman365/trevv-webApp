"use client";

import {
  demoWorkspaces,
  type AttentionSignal,
  type Portfolio,
  type WaitingState,
  type WorkItem,
  type Workspace,
} from "@founderhq/core";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";
import { useCustomWorkspaces } from "@/lib/custom-workspaces";
import { WorkspaceProvider } from "@/lib/workspace-context";
import type { StoredWorkspaceSelection } from "@/lib/workspace-selection";
import {
  AppSessionProvider,
  type AppSessionView,
} from "@/lib/app-session-context";
import {
  LiveAppDataProvider,
  useOptionalLiveAppData,
  type LiveAppDataSnapshot,
} from "@/lib/live-app-data";
import { LearningCenterProvider } from "./learning-center";
import { LiveStateNotice } from "./live-state";

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
  liveData,
}: {
  children: ReactNode;
  session: AppSessionView;
  storedSelection?: StoredWorkspaceSelection;
  liveData?: LiveAppDataSnapshot;
}) {
  const content = (
    <AppShellProviderContent
      session={session}
      {...(storedSelection ? { storedSelection } : {})}
    >
      {children}
    </AppShellProviderContent>
  );
  return liveData ? (
    <LiveAppDataProvider initialData={liveData}>{content}</LiveAppDataProvider>
  ) : (
    content
  );
}

function AppShellProviderContent({
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
  const availableLiveData = useOptionalLiveAppData();
  const liveData = session.demo ? null : availableLiveData;
  const liveSource = useMemo(
    () => (liveData ? toWorkspaceLiveSource(liveData) : undefined),
    [liveData],
  );
  const routeProject = useMemo(() => {
    const slug = workspaceSlugFrom(pathname);
    if (!slug) return undefined;
    return (
      liveSource?.workspaces ?? [
        ...customWorkspaceRecords.map((record) => record.workspace),
        ...demoWorkspaces,
      ]
    ).find((workspace) => workspace.slug === slug);
  }, [customWorkspaceRecords, liveSource, pathname]);

  if (liveData?.accessLost) {
    return (
      <AppSessionProvider session={session}>
        <main className="route-state-shell">
          <LiveStateNotice
            kind="permission-loss"
            title="Your access has changed"
            description="TREVV cleared the current workspace view. Sign in again, or ask an organization owner to restore access."
            actions={<Link href="/sign-in">Return to sign in</Link>}
          />
        </main>
      </AppSessionProvider>
    );
  }

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
        {...(liveSource ? { liveSource } : {})}
      >
        <LearningCenterProvider>{children}</LearningCenterProvider>
      </WorkspaceProvider>
    </AppSessionProvider>
  );
}

function toWorkspaceLiveSource(data: LiveAppDataSnapshot) {
  return {
    portfolios: data.portfolios.map((portfolio): Portfolio => ({
      ...portfolio,
    })),
    workspaces: data.workspaces.map(toWorkspace),
    items: data.items.map((item): WorkItem => ({
      id: item.id,
      workspaceId: item.workspaceId,
      boardId: item.boardId,
      title: item.title,
      type: item.type,
      priority: item.priority,
      status: item.status,
      ...(item.dueDate ? { dueDate: item.dueDate } : {}),
      ...(item.assignees[0]?.name ? { assignee: item.assignees[0].name } : {}),
      ...(item.approvalState ? { approvalState: item.approvalState } : {}),
      ...(item.decisionState ? { decisionState: item.decisionState } : {}),
    })),
    waiting: data.waiting.map((waiting): WaitingState => ({
      id: waiting.id,
      organizationId: waiting.organizationId,
      portfolioId: waiting.portfolioId,
      workspaceId: waiting.workspaceId,
      entityType: waiting.entityType,
      entityId: waiting.entityId,
      title: waiting.title,
      waitingType: waiting.waitingType,
      ...(waiting.waitingReferenceId !== undefined
        ? { waitingReferenceId: waiting.waitingReferenceId }
        : {}),
      ...(waiting.waitingLabel !== undefined
        ? { waitingLabel: waiting.waitingLabel }
        : {}),
      waitingSince: waiting.waitingSince,
      ...(waiting.expectedBy !== undefined
        ? { expectedBy: waiting.expectedBy }
        : {}),
      followUpOwnerId: waiting.followUpOwnerId,
      followUpOwnerName: waiting.followUpOwnerName,
      ...(waiting.nextFollowUp !== undefined
        ? { nextFollowUp: waiting.nextFollowUp }
        : {}),
      ...(waiting.waitingNote !== undefined
        ? { waitingNote: waiting.waitingNote }
        : {}),
      ...(waiting.resolvedAt !== undefined
        ? { resolvedAt: waiting.resolvedAt }
        : {}),
    })),
    attention: data.attention.map((signal): AttentionSignal => ({
      id: signal.id,
      organizationId: signal.organizationId,
      portfolioId: signal.portfolioId,
      ...(signal.workspaceId !== undefined
        ? { workspaceId: signal.workspaceId }
        : {}),
      entityType: signal.entityType,
      entityId: signal.entityId,
      signalType: signal.signalType as AttentionSignal["signalType"],
      severity: signal.severity,
      impact: signal.impact,
      urgency: signal.urgency,
      responsibility: signal.responsibility,
      reason: signal.reason,
      ...(signal.recommendedAction !== undefined
        ? { recommendedAction: signal.recommendedAction }
        : {}),
      createdAt: signal.createdAt,
      ...(signal.resolvedAt !== undefined
        ? { resolvedAt: signal.resolvedAt }
        : {}),
      ...(signal.dismissedAt !== undefined
        ? { dismissedAt: signal.dismissedAt }
        : {}),
      ...(signal.snoozedUntil !== undefined
        ? { snoozedUntil: signal.snoozedUntil }
        : {}),
      ...(signal.actionReason !== undefined
        ? { actionReason: signal.actionReason }
        : {}),
      metadata: signal.metadata,
    })),
    refreshedAt: data.refreshedAt,
  };
}

function toWorkspace(
  workspace: LiveAppDataSnapshot["workspaces"][number],
): Workspace {
  return {
    ...workspace,
    lead: workspace.lead ?? {
      name: "Unassigned",
      initials: "—",
      color: workspace.accent,
    },
    nextMilestone: workspace.nextMilestone ?? { title: "", date: "" },
    latestUpdate: workspace.latestUpdate ?? { text: "", date: "" },
  };
}
