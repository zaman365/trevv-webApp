"use client";

import dynamic from "next/dynamic";
import { lazy } from "react";
import type { DashboardSection } from "@/lib/dashboard-sections";
import { useLiveAppRecords } from "@/lib/live-app-data";

const SharedPlanningHub = dynamic(
  () => import("./shared-planning-hub").then((m) => m.SharedPlanningHub),
  { loading: () => <p>Loading plans and ideas…</p> },
);

const MyWork = lazy(() =>
  import("./live-work-my-work").then((m) => ({ default: m.LiveMyWork })),
);
const Projects = lazy(() =>
  import("./live-project-planning").then((m) => ({
    default: m.ProjectPlanningContent,
  })),
);
const Teams = lazy(() =>
  import("./live-team-workflow").then((m) => ({
    default: m.LiveTeamWorkflowContent,
  })),
);
const Messages = lazy(() =>
  import("./live-messaging-workspace").then((m) => ({
    default: m.LiveMessagingContent,
  })),
);
const CaptureInbox = lazy(() =>
  import("./live-work-inbox").then((m) => ({ default: m.LiveInboxFeature })),
);
const Attention = lazy(() =>
  import("./live-work-attention").then((m) => ({ default: m.LiveAttention })),
);
const Transitions = lazy(() =>
  import("./live-work-transitions").then((m) => ({
    default: m.LiveTransitions,
  })),
);
const Waiting = lazy(() =>
  import("./live-work-waiting").then((m) => ({ default: m.LiveWaiting })),
);
export function DashboardSectionContent({
  section,
  workspaceId,
  workspaceSlug,
}: {
  section: Exclude<DashboardSection, "summary">;
  workspaceId: string;
  workspaceSlug: string;
}) {
  const data = useLiveAppRecords();
  const items = data.items.filter((item) => item.workspaceId === workspaceId);
  switch (section) {
    case "ideas":
      return (
        <SharedPlanningHub
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      );
    case "my-work":
      return (
        <>
          <SharedPlanningHub
            workspaceId={workspaceId}
            workspaceSlug={workspaceSlug}
            personal
            compact
          />
          <MyWork items={items} workspaceSlug={workspaceSlug} />
        </>
      );
    case "planning":
      return (
        <Projects workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
      );
    case "teams":
      return <Teams workspaceSlug={workspaceSlug} embedded />;
    case "messages":
      return <Messages workspaceSlug={workspaceSlug} embedded />;
    case "inbox":
      return (
        <CaptureInbox workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
      );
    case "attention":
      return (
        <Attention
          signals={data.attention.filter(
            (signal) => signal.workspaceId === workspaceId,
          )}
        />
      );
    case "decisions":
      return (
        <Transitions
          items={items.filter((item) => item.type === "decision")}
          kind="decision"
          workspaceId={workspaceId}
        />
      );
    case "approvals":
      return (
        <Transitions
          items={items.filter((item) => item.type === "approval")}
          kind="approval"
          workspaceId={workspaceId}
        />
      );
    case "waiting":
      return (
        <Waiting
          records={data.waiting.filter(
            (record) => record.workspaceId === workspaceId,
          )}
        />
      );
  }
}
