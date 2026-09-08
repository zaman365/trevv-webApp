import { useState } from "react";
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
import { board, session, snapshot } from "./live-workflow-data";

function Workflow() {
  const data = useLiveAppRecords();
  const queryClient = useQueryClient();
  const [capture, setCapture] = useState(false);
  const [confirmed, setConfirmed] = useState<LiveCaptureSuccess | null>(null);
  return (
    <>
      <button onClick={() => setCapture(true)}>Quick capture</button>
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
      <LiveBoardExperience boardId={board.id} workspaceSlug="launch" />
      <LiveMyWork items={data.items} workspaceSlug="launch" />
      <LiveInboxFeature
        workspaceId={board.workspaceId}
        workspaceSlug="launch"
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <AppSessionProvider session={session}>
    <LiveAppDataProvider
      initialData={{ ...snapshot, refreshedAt: new Date().toISOString() }}
    >
      <Workflow />
    </LiveAppDataProvider>
  </AppSessionProvider>,
);
