import { WorkspaceModuleLoader } from "@/components/workspace-module-loader";
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
    <WorkspaceModuleLoader
      view="dashboard"
      runtimeMode={webRuntimeMode()}
      workspaceSlug={workspaceSlug}
    />
  );
}
