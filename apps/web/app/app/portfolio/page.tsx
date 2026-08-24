import type { Metadata } from "next";
import { PortfolioExperience } from "@/components/portfolio-experience";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "See every Hub, risk, decision, approval, and next milestone in one live portfolio.",
};

export default function PortfolioPage() {
  return <PortfolioExperience />;
}
