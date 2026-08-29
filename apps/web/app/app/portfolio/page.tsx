import type { Metadata } from "next";
import { PortfolioExperience } from "@/components/portfolio-experience";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Explore fictional projects, risks, decisions, approvals, and milestones in the TREVV technical preview.",
};

export default function PortfolioPage() {
  return <PortfolioExperience />;
}
