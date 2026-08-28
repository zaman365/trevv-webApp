import type { Metadata } from "next";
import { PortfolioExperience } from "@/components/portfolio-experience";

export const metadata: Metadata = {
  title: "Portfolio overview",
  description:
    "One cumulative view of every workspace, risk, decision, approval, milestone, update, and workload in a portfolio.",
};

export default function PortfolioPage() {
  return <PortfolioExperience />;
}
