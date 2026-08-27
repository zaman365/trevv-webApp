import type { Metadata } from "next";
import { MessagingWorkspace } from "@/components/messaging-workspace";
import { WorkspaceFrame } from "@/components/workspace-frame";

export const metadata: Metadata = {
  title: "Messages",
  description:
    "Work-context messaging, requests, decisions, and updates across TREVV.",
};

export default function MessagesPage() {
  return (
    <WorkspaceFrame active="messages">
      <MessagingWorkspace />
    </WorkspaceFrame>
  );
}
