import { HubOverview } from "@/components/hub-overview";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <HubOverview slug={workspaceSlug} />;
}
