import type { Metadata } from "next";
import { StakeholderExperience } from "@/components/stakeholder-experience";

export const metadata: Metadata = {
  title: "Stakeholder view",
  description:
    "A permission-safe summary containing only explicitly shared project information.",
};

export default async function StakeholderPage({
  params,
}: {
  params: Promise<{ hubSlug: string }>;
}) {
  const { hubSlug } = await params;
  return <StakeholderExperience slug={hubSlug} />;
}
