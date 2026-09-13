import "@founderhq/design-tokens/css";
import "../app/globals.css";
import "../app/workspace.css";
import "../app/design-system.css";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { QuickCaptureButton } from "../components/quick-capture-button";
import { useQueryClient } from "@tanstack/react-query";
import { workspaceResourceKeys } from "../lib/workspace-resource-keys";
import { createRoot } from "react-dom/client";
import { AppSessionProvider } from "../lib/app-session-context";
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
import { board, session, snapshot } from "./live-workflow-data";
import type { WorkItemDto } from "@founderhq/api-contract";

function Workflow() {
  const data = useLiveAppRecords();
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState(false);
  const [confirmed, setConfirmed] = useState<LiveCaptureSuccess | null>(null);
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
  <AppSessionProvider session={session}>
    <LiveAppDataProvider
      initialData={{
        ...snapshot,
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
      <Workflow />
    </LiveAppDataProvider>
  </AppSessionProvider>,
);
