import type { Metadata } from "next";
import { ImportExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Import",
  description:
    "Preset-aware CSV migration with mapping, dry run, and complete reporting.",
};

export default async function WorkspaceImportPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <ImportExperience workspaceSlug={workspaceSlug} />;
}
