import { Profiler, useMemo, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  LiveAppDataProvider,
  useLiveAppRecords,
  useLiveAppRefreshedAt,
  type LiveAppDataSnapshot,
} from "../lib/live-app-data";
import { WorkspaceProvider, useWorkspaceState } from "../lib/workspace-context";
import {
  useCustomWorkspaces,
  createCustomWorkspace,
} from "../lib/custom-workspaces";
import { useCustomPortfolios } from "../lib/custom-portfolios";
import { useCapturedWork } from "../lib/captured-work";

import { useLiveConversation } from "../lib/live-collaboration";

const initialData: LiveAppDataSnapshot = {
  portfolios: [
    {
      id: "portfolio-one",
      organizationId: "org-one",
      name: "Original",
      slug: "original",
      description: "",
      isDefault: true,
    },
  ],
  workspaces: [],
  items: [],
  attention: [],
  waiting: [],
  refreshedAt: new Date().toISOString(),
};
const commits = { records: 0, workspace: 0, storage: 0 };
Object.assign(window, { performanceCommits: commits });

function Workspace({ children }: { children: ReactNode }) {
  const data = useLiveAppRecords();
  const source = useMemo(
    () => ({
      portfolios: data.portfolios,
      workspaces: [],
      items: [],
      attention: [],
      waiting: [],
    }),
    [data.portfolios],
  );
  return <WorkspaceProvider liveSource={source}>{children}</WorkspaceProvider>;
}
function Records() {
  const data = useLiveAppRecords();
  const [draft, setDraft] = useState("");
  return (
    <Profiler id="records" onRender={() => commits.records++}>
      <output id="records">
        {data.portfolios.map((portfolio) => portfolio.name).join(",")}
      </output>
      <output id="access">{data.accessLost ? "lost" : "active"}</output>
      <output id="stale">{String(data.stale)}</output>
      <input
        aria-label="Draft"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <button onClick={() => void data.refresh()}>Refresh</button>
    </Profiler>
  );
}
function WorkspaceRecords() {
  const workspace = useWorkspaceState();
  return (
    <Profiler id="workspace" onRender={() => commits.workspace++}>
      <output id="workspace">{workspace.portfolioId}</output>
    </Profiler>
  );
}
function Clock() {
  return <output id="clock">{useLiveAppRefreshedAt()}</output>;
}
function StorageRecords() {
  const records = useCustomWorkspaces();
  useCustomPortfolios();
  useCapturedWork();
  return (
    <Profiler id="storage" onRender={() => commits.storage++}>
      <output id="storage">
        {records.map((record) => record.workspace.name).join(",")}
      </output>
      <button
        onClick={() =>
          createCustomWorkspace({
            name: "Local draft",
            portfolioId: "portfolio-one",
            type: "business",
            lead: "Test",
            priority: "Normal",
            milestone: "",
            milestoneDate: "",
          })
        }
      >
        Create local workspace
      </button>
    </Profiler>
  );
}
function ConversationReader() {
  const [id, setId] = useState("room-one");
  const query = useLiveConversation("workspace-one", id);
  return (
    <>
      <select
        aria-label="Conversation"
        value={id}
        onChange={(event) => setId(event.target.value)}
      >
        <option value="room-one">One</option>
        <option value="room-two">Two</option>
      </select>
      <output id="conversation">{query.data?.id ?? "Loading"}</output>
    </>
  );
}
function Harness() {
  const [seeded, setSeeded] = useState(location.hash !== "#cold-navigation");
  const [identity, setIdentity] = useState("one");
  return (
    <>
      <button onClick={() => setSeeded(false)}>Navigate without seed</button>
      <button
        onClick={() => {
          setSeeded(false);
          setIdentity("two");
        }}
      >
        Change identity
      </button>
      <LiveAppDataProvider key={identity} {...(seeded ? { initialData } : {})}>
        <Workspace>
          <Records />
          <WorkspaceRecords />
          <Clock />
          <StorageRecords />
          {location.hash === "#conversation" ? <ConversationReader /> : null}
        </Workspace>
      </LiveAppDataProvider>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
