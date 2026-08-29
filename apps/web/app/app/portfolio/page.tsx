import type { Metadata } from "next";
import { PortfolioExperience } from "@/components/portfolio-experience";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Explore fictional projects, risks, decisions, approvals, and milestones in the TREVV technical preview.",
};

export default async function PortfolioPage() {
  await requireAppSession("/app/portfolio");
  return <PortfolioExperience />;
}
