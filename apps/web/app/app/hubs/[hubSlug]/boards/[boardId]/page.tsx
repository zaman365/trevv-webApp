import { permanentRedirect } from "next/navigation";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ hubSlug: string; boardId: string }>;
}) {
  const { hubSlug, boardId } = await params;
  permanentRedirect(
    `/app/workspaces/${encodeURIComponent(hubSlug)}/boards/${encodeURIComponent(boardId)}`,
  );
}
