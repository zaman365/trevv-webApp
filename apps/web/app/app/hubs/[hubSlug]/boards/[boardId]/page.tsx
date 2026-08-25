import { BoardExperience } from "@/components/board-experience";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ hubSlug: string; boardId: string }>;
}) {
  const { hubSlug, boardId } = await params;
  return <BoardExperience hubSlug={hubSlug} boardId={boardId} />;
}
