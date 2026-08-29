import type { Metadata } from "next";
import { ImportExperience } from "@/components/management-experience";

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
  return <ImportExperience workspaceSlug={workspaceSlug} />;
}
