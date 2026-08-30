import { BoardLoader } from "@/components/board-loader";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";
import { workspaceHref } from "@/lib/workspace-routes";

export default async function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; boardId: string }>;
}) {
  const { workspaceSlug, boardId } = await params;
  const returnTo = `${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(boardId)}`;
  await requireWorkspaceAccess(workspaceSlug, returnTo);
  return (
    <BoardLoader
      boardId={boardId}
      runtimeMode={webRuntimeMode()}
      workspaceSlug={workspaceSlug}
    />
  );
}
