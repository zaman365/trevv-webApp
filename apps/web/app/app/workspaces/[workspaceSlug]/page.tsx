import { LiveWorkspaceOverview } from "@/components/live-workspace-overview";
import { WorkspaceOverview } from "@/components/workspace-overview";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccess(workspaceSlug, workspaceHref(workspaceSlug));
  if (webRuntimeMode() === "live") {
    return <LiveWorkspaceOverview workspaceSlug={workspaceSlug} />;
  }
  return <WorkspaceOverview slug={workspaceSlug} />;
}
