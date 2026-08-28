import { BoardExperience } from "@/components/board-experience";

export default async function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; boardId: string }>;
}) {
  const { workspaceSlug, boardId } = await params;
  return <BoardExperience workspaceSlug={workspaceSlug} boardId={boardId} />;
}
