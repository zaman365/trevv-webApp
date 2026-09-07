import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

/** Authorize before redirecting so inaccessible saved links keep a true 404. */
export default async function LegacyHubPage({
  params,
}: {
  params: Promise<{ hubSlug: string; boardId: string }>;
}) {
  const { hubSlug, boardId } = await params;
  const destination = `${workspaceHref(hubSlug)}/boards/${encodeURIComponent(boardId)}`;
  await requireWorkspaceAccess(hubSlug, destination, { details: false });
  redirect(destination);
}
