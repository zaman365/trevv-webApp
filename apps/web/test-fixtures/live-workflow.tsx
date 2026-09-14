import { LivePortfolioExperience } from "../components/live-portfolio-experience";
import { LivePersonalWork } from "../components/live-personal-work";
import { CalendarExperience } from "../components/calendar-experience";
import { LiveWorkView } from "../components/live-work-views";
import { LiveProjectPlanning } from "../components/live-project-planning";
import { WorkspaceProvider } from "../lib/workspace-context";
import "@founderhq/design-tokens/css";
import "../app/globals.css";
import "../app/workspace.css";
import "../app/design-system.css";
import { FloatingChatProvider } from "../lib/floating-chat-context";
import { LivePeoplePage } from "../components/live-people-page";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { QuickCaptureButton } from "../components/quick-capture-button";
import { useQueryClient } from "@tanstack/react-query";
import { workspaceResourceKeys } from "../lib/workspace-resource-keys";
import { createRoot } from "react-dom/client";
import { AppSessionProvider } from "../lib/app-session-context";
import { PlanningSharingProvider } from "../lib/planning-sharing";
import { LiveAppDataProvider, useLiveAppRecords } from "../lib/live-app-data";
import { LiveBoardExperience } from "../components/live-board-experience";
import {
  LiveQuickCaptureDialog,
  type LiveCaptureSuccess,
} from "../components/live-quick-capture";
import { LiveMyWork } from "../components/live-work-my-work";
import { LiveInboxFeature } from "../components/live-work-inbox";
import { LiveWorkspaceDashboard } from "../components/live-workspace-dashboard";
import { LiveTeamWorkflow } from "../components/live-team-workflow";
import { LiveTeamPage } from "../components/live-team-page";
import { LiveAttention } from "../components/live-work-attention";
import { LiveMessagingWorkspace } from "../components/live-messaging-workspace";
import { ReportPlanWorkspace } from "../components/report-plan-experience";
import { board, session, snapshot } from "./live-workflow-data";
import type { WorkItemDto } from "@founderhq/api-contract";

function Workflow() {
  const data = useLiveAppRecords();
  const view = new URLSearchParams(window.location.search).get("view");
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState(false);
  const [confirmed, setConfirmed] = useState<LiveCaptureSuccess | null>(null);
  if (view === "report-log" || view === "report-plan")
    return (
      <ReportPlanWorkspace
        workspaceId={board.workspaceId}
        workspaceSlug="launch"
      />
    );
  if (view === "personal") return <LivePersonalWork />;
  if (view === "calendar")
    return (
      <WorkspaceProvider
        portfolioScoped
        liveSource={{
          portfolios: data.portfolios,
          workspaces: data.workspaces.map((workspace) => ({
            ...workspace,
            lead: workspace.lead ?? {
              name: "Owner",
              initials: "OW",
              color: workspace.accent,
            },
            nextMilestone: workspace.nextMilestone ?? { title: "", date: "" },
            latestUpdate: workspace.latestUpdate ?? { text: "", date: "" },
          })),
          items: [],
          waiting: [],
          attention: [],
        }}
      >
        <CalendarExperience workspaceSlug="launch" />
      </WorkspaceProvider>
    );
  if (view === "portfolio")
    return (
      <WorkspaceProvider portfolioScoped>
        <LivePortfolioExperience />
      </WorkspaceProvider>
    );
  if (view === "planning")
    return <LiveProjectPlanning workspaceSlug="launch" />;
  if (view?.startsWith("page-"))
    return (
      <LiveWorkView
        workspaceSlug="launch"
        view={view.slice(5) as Parameters<typeof LiveWorkView>[0]["view"]}
      />
    );
  if (new URLSearchParams(window.location.search).get("view") === "people")
    return <LivePeoplePage workspaceSlug="launch" />;
  if (new URLSearchParams(window.location.search).get("view") === "person")
    return (
      <LivePeoplePage
        workspaceSlug="launch"
        userId={
          new URLSearchParams(window.location.search).get("userId") ??
          "user-two"
        }
      />
    );
  if (new URLSearchParams(window.location.search).get("view") === "chat")
    return (
      <main>
        <h1>Workspace overview</h1>
        <a href="#projects">Projects on this page</a>
      </main>
    );
  if (new URLSearchParams(window.location.search).get("view") === "attention")
    return (
      <main style={{ padding: 24 }}>
        <LiveAttention signals={data.attention} />
      </main>
    );
  if (new URLSearchParams(window.location.search).get("view") === "team")
    return (
      <LiveTeamPage
        workspaceSlug="launch"
        teamId={
          new URLSearchParams(window.location.search).get("teamId") ??
          "team-launch"
        }
      />
    );
  if (new URLSearchParams(window.location.search).get("view") === "messages")
    return <LiveMessagingWorkspace workspaceSlug="launch" />;
  if (new URLSearchParams(window.location.search).get("view") === "teams")
    return <LiveTeamWorkflow workspaceSlug="launch" />;
  if (new URLSearchParams(window.location.search).get("view") === "dashboard")
    return (
      <>
        <button onClick={() => void data.refresh()}>
          Refresh test records
        </button>
        <LiveWorkspaceDashboard workspaceSlug="launch" />
      </>
    );
  return (
    <>
      <header className="topbar">
        <nav className="topbar-actions" aria-label="Workspace shortcuts">
          <QuickCaptureButton onClick={() => setCapture(true)} />
          <a className="topbar-tool" href="#attention" aria-label="Attention">
            <Sparkles size={17} />
          </a>
        </nav>
      </header>
      <button onClick={() => void data.refresh()}>Refresh test records</button>
      <button
        onClick={() =>
          void queryClient.invalidateQueries({
            queryKey: workspaceResourceKeys.board(
              session.organization.id,
              board.workspaceId,
              board.id,
            ),
          })
        }
      >
        Refresh board metadata
      </button>
      <output id="stale">{String(data.stale)}</output>
      <output id="capture-result">{JSON.stringify(confirmed)}</output>
      {capture ? (
        <LiveQuickCaptureDialog
          workspaceId={board.workspaceId}
          workspaceSlug="launch"
          onClose={() => setCapture(false)}
          onConfirmed={(result) => {
            setConfirmed(result);
            setCapture(false);
          }}
        />
      ) : null}
      {new URLSearchParams(window.location.search).get("view") !== "capture" ? (
        <>
          <LiveBoardExperience boardId={board.id} workspaceSlug="launch" />
          <LiveMyWork items={data.items} workspaceSlug="launch" />
          <LiveInboxFeature
            workspaceId={board.workspaceId}
            workspaceSlug="launch"
          />
        </>
      ) : null}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppSessionProvider
    session={{
      ...session,
      managedWorkspaceIds:
        (window as Window & { __workflowManagedWorkspaceIds?: string[] })
          .__workflowManagedWorkspaceIds ?? session.managedWorkspaceIds,
    }}
  >
    <LiveAppDataProvider
      initialData={{
        ...snapshot,
        workspaces:
          (
            window as Window & {
              __workflowWorkspaces?: import("@founderhq/api-contract").WorkspaceDto[];
            }
          ).__workflowWorkspaces ?? snapshot.workspaces,
        attention:
          (
            window as Window & {
              __workflowAttention?: import("@founderhq/api-contract").AttentionSignalDto[];
            }
          ).__workflowAttention ?? snapshot.attention,
        items:
          (window as Window & { __workflowInitialItems?: WorkItemDto[] })
            .__workflowInitialItems ?? snapshot.items,
        refreshedAt: new Date().toISOString(),
      }}
    >
      <PlanningSharingProvider>
        <FloatingChatProvider defaultWorkspaceSlug="launch">
          <Workflow />
        </FloatingChatProvider>
      </PlanningSharingProvider>
    </LiveAppDataProvider>
  </AppSessionProvider>,
);
