import { WorkspaceOverview } from "@/components/workspace-overview";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <WorkspaceOverview slug={workspaceSlug} />;
}
