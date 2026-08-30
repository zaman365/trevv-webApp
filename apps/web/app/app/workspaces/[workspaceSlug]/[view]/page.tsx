import { notFound } from "next/navigation";
import { WorkspaceModuleLoader } from "@/components/workspace-module-loader";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { isWorkspaceView, workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspaceModulePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; view: string }>;
}) {
  const { workspaceSlug, view } = await params;
  const returnTo = isWorkspaceView(view)
    ? workspaceHref(workspaceSlug, view)
    : workspaceHref(workspaceSlug);
  await requireWorkspaceAccess(workspaceSlug, returnTo);
  if (!isWorkspaceView(view)) notFound();

  return (
    <WorkspaceModuleLoader
      runtimeMode={webRuntimeMode()}
      view={view}
      workspaceSlug={workspaceSlug}
    />
  );
}
