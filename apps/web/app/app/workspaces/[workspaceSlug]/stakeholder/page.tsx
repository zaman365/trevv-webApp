import type { Metadata } from "next";
import { StakeholderExperience } from "@/components/stakeholder-experience";
import { requireWorkspaceAccess } from "@/lib/server-auth";
import { workspaceHref } from "@/lib/workspace-routes";

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
  const returnTo = `${workspaceHref(workspaceSlug)}/stakeholder`;
  await requireWorkspaceAccess(workspaceSlug, returnTo, { details: false });
  return <StakeholderExperience slug={workspaceSlug} />;
}
