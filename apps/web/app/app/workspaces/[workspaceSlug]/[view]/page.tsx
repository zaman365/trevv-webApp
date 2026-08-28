import { notFound } from "next/navigation";
import { DashboardExperience } from "@/components/dashboard-experience";
import { FocusExperience } from "@/components/focus-experience";
import {
  AttentionExperience,
  BlueprintsExperience,
  IdeasExperience,
  NotificationsExperience,
  ReviewsExperience,
  TeamExperience,
  WaitingExperience,
} from "@/components/management-experience";
import { MessagingWorkspace } from "@/components/messaging-workspace";
import { SettingsExperience } from "@/components/settings-experience";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { isWorkspaceView } from "@/lib/workspace-routes";

export default async function WorkspaceModulePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; view: string }>;
}) {
  const { workspaceSlug, view } = await params;
  if (!isWorkspaceView(view)) notFound();

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
      return (
        <WorkspaceFrame active="messages" hubSlug={workspaceSlug}>
          <MessagingWorkspace />
        </WorkspaceFrame>
      );
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
    case "team":
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
