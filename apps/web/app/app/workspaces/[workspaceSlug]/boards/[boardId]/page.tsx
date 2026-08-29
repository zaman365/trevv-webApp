import { BoardExperience } from "@/components/board-experience";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; boardId: string }>;
}) {
  const { workspaceSlug, boardId } = await params;
  const returnTo = `${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(boardId)}`;
  await requireWorkspaceAccess(workspaceSlug, returnTo);
  return <BoardExperience workspaceSlug={workspaceSlug} boardId={boardId} />;
}
