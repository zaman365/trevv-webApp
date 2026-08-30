"use client";

import dynamic from "next/dynamic";
import type { WebRuntimeMode } from "@/lib/web-runtime-config";
import { RouteLoadingState } from "./live-state";

const loading = () => <RouteLoadingState label="Loading workspace" />;
const LiveWorkspaceOverview = dynamic(
  () =>
    import("./live-workspace-overview").then(
      (module) => module.LiveWorkspaceOverview,
    ),
  { loading },
);
const WorkspaceOverview = dynamic(
  () =>
    import("./workspace-overview").then((module) => module.WorkspaceOverview),
  { loading },
);

export function WorkspaceOverviewLoader({
  runtimeMode,
  workspaceSlug,
}: {
  runtimeMode: WebRuntimeMode;
  workspaceSlug: string;
}) {
  return runtimeMode === "live" ? (
    <LiveWorkspaceOverview workspaceSlug={workspaceSlug} />
  ) : (
    <WorkspaceOverview slug={workspaceSlug} />
  );
}
