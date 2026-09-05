import type { Metadata } from "next";
import { ImportExperience } from "@/components/management-experience";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

export const metadata: Metadata = {
  title: "Import preview",
  description:
    "A fictional CSV mapping and dry-run walkthrough that uploads no file and creates no record.",
};

export default async function WorkspaceImportPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const returnTo = `${workspaceHref(workspaceSlug)}/settings/import`;
  await requireWorkspaceAccess(workspaceSlug, returnTo, { details: false });
  return <ImportExperience workspaceSlug={workspaceSlug} />;
}
