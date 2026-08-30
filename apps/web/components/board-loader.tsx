"use client";

import dynamic from "next/dynamic";
import type { WebRuntimeMode } from "@/lib/web-runtime-config";
import { RouteLoadingState } from "./live-state";

const loading = () => <RouteLoadingState label="Loading board" />;
const LiveBoardExperience = dynamic(
  () =>
    import("./live-board-experience").then(
      (module) => module.LiveBoardExperience,
    ),
  { loading },
);
const BoardExperience = dynamic(
  () => import("./board-experience").then((module) => module.BoardExperience),
  { loading },
);

export function BoardLoader({
  boardId,
  runtimeMode,
  workspaceSlug,
}: {
  boardId: string;
  runtimeMode: WebRuntimeMode;
  workspaceSlug: string;
}) {
  return runtimeMode === "live" ? (
    <LiveBoardExperience boardId={boardId} workspaceSlug={workspaceSlug} />
  ) : (
    <BoardExperience boardId={boardId} workspaceSlug={workspaceSlug} />
  );
}
