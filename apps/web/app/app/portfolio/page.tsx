import type { Metadata } from "next";
import { LivePortfolioExperience } from "@/components/live-portfolio-experience";
import { PortfolioExperience } from "@/components/portfolio-experience";
import { requireAppSession } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "View accessible workspaces, risks, decisions, approvals, and milestones in TREVV.",
};

export default async function PortfolioPage() {
  await requireAppSession("/app/portfolio");
  if (webRuntimeMode() === "live") return <LivePortfolioExperience />;
  return <PortfolioExperience />;
}
