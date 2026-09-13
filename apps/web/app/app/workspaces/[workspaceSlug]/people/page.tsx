import { redirect } from "next/navigation";
import { LivePeoplePage } from "@/components/live-people-page";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { personHref } from "@/lib/people-workspace";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspacePeoplePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  await requireWorkspaceAccess(workspaceSlug, personHref(workspaceSlug), {
    details: false,
  });
  if (webRuntimeMode() !== "live")
    redirect(workspaceHref(workspaceSlug, "teams"));
  return <LivePeoplePage key={workspaceSlug} workspaceSlug={workspaceSlug} />;
}
