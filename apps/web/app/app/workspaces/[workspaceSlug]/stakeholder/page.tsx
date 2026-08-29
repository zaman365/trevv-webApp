import type { Metadata } from "next";
import { StakeholderExperience } from "@/components/stakeholder-experience";

export const metadata: Metadata = {
  title: "Stakeholder preview",
  description:
    "A fictional stakeholder-view sample that is not authenticated, shared, or permission-enforced.",
};

export default async function WorkspaceStakeholderPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <StakeholderExperience slug={workspaceSlug} />;
}
