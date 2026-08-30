"use client";

import { MessagingWorkspace } from "./messaging-workspace";
import { WorkspaceFrame } from "./workspace-frame";

export function DemoMessagingExperience({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  return (
    <WorkspaceFrame active="messages" workspaceSlug={workspaceSlug}>
      <MessagingWorkspace />
    </WorkspaceFrame>
  );
}
