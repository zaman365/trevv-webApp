import { TaskPage } from "@/components/task-page";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { taskHref } from "@/lib/workspace-routes";
export default async function TaskRoute({
  params,
}: {
  params: Promise<{ workspaceSlug: string; itemId: string }>;
}) {
  const { workspaceSlug, itemId } = await params;
  await requireWorkspaceAccess(workspaceSlug, taskHref(workspaceSlug, itemId), {
    details: false,
  });
  return (
    <TaskPage key={itemId} workspaceSlug={workspaceSlug} itemId={itemId} />
  );
}
