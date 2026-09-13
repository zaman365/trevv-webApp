import { redirect } from "next/navigation";
import { LiveTeamPage } from "@/components/live-team-page";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspaceTeamPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; teamId: string }>;
}) {
  const { workspaceSlug, teamId } = await params;
  await requireWorkspaceAccess(workspaceSlug, teamHref(workspaceSlug, teamId), {
    details: false,
  });
  if (webRuntimeMode() !== "live")
    redirect(workspaceHref(workspaceSlug, "teams"));
  return (
    <LiveTeamPage
      key={`${workspaceSlug}:${teamId}`}
      workspaceSlug={workspaceSlug}
      teamId={teamId}
    />
  );
}
