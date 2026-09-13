import { redirect } from "next/navigation";
import { LivePeoplePage } from "@/components/live-people-page";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { personHref } from "@/lib/people-workspace";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspacePersonPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; userId: string }>;
}) {
  const { workspaceSlug, userId } = await params;
  await requireWorkspaceAccess(
    workspaceSlug,
    personHref(workspaceSlug, userId),
    { details: false },
  );
  if (webRuntimeMode() !== "live")
    redirect(workspaceHref(workspaceSlug, "teams"));
  return (
    <LivePeoplePage
      key={`${workspaceSlug}:${userId}`}
      workspaceSlug={workspaceSlug}
      userId={userId}
    />
  );
}
