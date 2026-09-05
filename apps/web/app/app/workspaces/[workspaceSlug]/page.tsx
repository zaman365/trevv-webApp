import { WorkspaceOverviewLoader } from "@/components/workspace-overview-loader";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccess(workspaceSlug, workspaceHref(workspaceSlug), {
    details: false,
  });
  return (
    <WorkspaceOverviewLoader
      runtimeMode={webRuntimeMode()}
      workspaceSlug={workspaceSlug}
    />
  );
}
