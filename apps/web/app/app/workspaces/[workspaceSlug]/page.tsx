import { WorkspaceOverview } from "@/components/workspace-overview";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccess(workspaceSlug, workspaceHref(workspaceSlug));
  return <WorkspaceOverview slug={workspaceSlug} />;
}
