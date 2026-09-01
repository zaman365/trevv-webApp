"use client";

import dynamic from "next/dynamic";
import { RouteLoadingState } from "./live-state";
import type { WebRuntimeMode } from "@/lib/web-runtime-config";
import type { WorkspaceView } from "@/lib/workspace-routes";

const loading = () => <RouteLoadingState label="Loading workspace view" />;

const DashboardExperience = dynamic(
  () =>
    import("./dashboard-experience").then(
      (module) => module.DashboardExperience,
    ),
  { loading },
);
const CalendarExperience = dynamic(
  () =>
    import("./calendar-experience").then((module) => module.CalendarExperience),
  { loading },
);
const FocusExperience = dynamic(
  () => import("./focus-experience").then((module) => module.FocusExperience),
  { loading },
);
const LiveWorkspaceOverview = dynamic(
  () =>
    import("./live-workspace-overview").then(
      (module) => module.LiveWorkspaceOverview,
    ),
  { loading },
);
const LiveWorkView = dynamic(
  () => import("./live-work-views").then((module) => module.LiveWorkView),
  { loading },
);
const LiveMessagingWorkspace = dynamic(
  () =>
    import("./live-messaging-workspace").then(
      (module) => module.LiveMessagingWorkspace,
    ),
  { loading },
);
const LiveTeamWorkflow = dynamic(
  () =>
    import("./live-team-workflow").then((module) => module.LiveTeamWorkflow),
  { loading },
);
const AttentionExperience = dynamic(
  () =>
    import("./management-experience").then(
      (module) => module.AttentionExperience,
    ),
  { loading },
);
const WaitingExperience = dynamic(
  () =>
    import("./management-experience").then(
      (module) => module.WaitingExperience,
    ),
  { loading },
);
const ReviewsExperience = dynamic(
  () =>
    import("./management-experience").then(
      (module) => module.ReviewsExperience,
    ),
  { loading },
);
const IdeasExperience = dynamic(
  () =>
    import("./management-experience").then((module) => module.IdeasExperience),
  { loading },
);
const TeamExperience = dynamic(
  () =>
    import("./management-experience").then((module) => module.TeamExperience),
  { loading },
);
const BlueprintsExperience = dynamic(
  () =>
    import("./management-experience").then(
      (module) => module.BlueprintsExperience,
    ),
  { loading },
);
const NotificationsExperience = dynamic(
  () =>
    import("./management-experience").then(
      (module) => module.NotificationsExperience,
    ),
  { loading },
);
const DemoMessagingExperience = dynamic(
  () =>
    import("./demo-messaging-experience").then(
      (module) => module.DemoMessagingExperience,
    ),
  { loading },
);
const SettingsExperience = dynamic(
  () =>
    import("./settings-experience").then((module) => module.SettingsExperience),
  { loading },
);

export function WorkspaceModuleLoader({
  runtimeMode,
  view,
  workspaceSlug,
}: {
  runtimeMode: WebRuntimeMode;
  view: WorkspaceView;
  workspaceSlug: string;
}) {
  if (view === "calendar") {
    return <CalendarExperience workspaceSlug={workspaceSlug} />;
  }
  if (runtimeMode === "live") {
    if (view === "dashboard") {
      return <LiveWorkspaceOverview dashboard workspaceSlug={workspaceSlug} />;
    }
    if (view === "messages") {
      return <LiveMessagingWorkspace workspaceSlug={workspaceSlug} />;
    }
    if (view === "teams") {
      return <LiveTeamWorkflow workspaceSlug={workspaceSlug} />;
    }
    return <LiveWorkView view={view} workspaceSlug={workspaceSlug} />;
  }

  switch (view) {
    case "dashboard":
      return <DashboardExperience workspaceSlug={workspaceSlug} />;
    case "attention":
      return <AttentionExperience workspaceSlug={workspaceSlug} />;
    case "my-work":
      return <FocusExperience kind="myWork" workspaceSlug={workspaceSlug} />;
    case "inbox":
      return <FocusExperience kind="inbox" workspaceSlug={workspaceSlug} />;
    case "messages":
      return <DemoMessagingExperience workspaceSlug={workspaceSlug} />;
    case "decisions":
      return <FocusExperience kind="decisions" workspaceSlug={workspaceSlug} />;
    case "approvals":
      return <FocusExperience kind="approvals" workspaceSlug={workspaceSlug} />;
    case "ideas":
      return <IdeasExperience workspaceSlug={workspaceSlug} />;
    case "reviews":
      return <ReviewsExperience workspaceSlug={workspaceSlug} />;
    case "waiting":
      return <WaitingExperience workspaceSlug={workspaceSlug} />;
    case "teams":
      return <TeamExperience workspaceSlug={workspaceSlug} />;
    case "blueprints":
      return <BlueprintsExperience workspaceSlug={workspaceSlug} />;
    case "notifications":
      return <NotificationsExperience workspaceSlug={workspaceSlug} />;
    case "search":
      return <FocusExperience kind="search" workspaceSlug={workspaceSlug} />;
    case "settings":
      return <SettingsExperience workspaceSlug={workspaceSlug} />;
  }
}
