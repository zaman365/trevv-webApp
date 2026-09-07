import { redirect } from "next/navigation";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

/** Authorize before redirecting so inaccessible saved links keep a true 404. */
export default async function LegacyHubPage({
  params,
}: {
  params: Promise<{ hubSlug: string }>;
}) {
  const { hubSlug } = await params;
  const destination = `${workspaceHref(hubSlug)}/stakeholder`;
  await requireWorkspaceAccess(hubSlug, destination, { details: false });
  redirect(destination);
}
