import type { Metadata } from "next";
import { StakeholderExperience } from "@/components/stakeholder-experience";

export const metadata: Metadata = {
  title: "Stakeholder view",
  description:
    "A permission-safe summary containing only explicitly shared workspace information.",
};

export default async function WorkspaceStakeholderPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  return <StakeholderExperience slug={workspaceSlug} />;
}
