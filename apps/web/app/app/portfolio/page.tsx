import type { Metadata } from "next";
import { PortfolioLoader } from "@/components/portfolio-loader";
import { requireAppSession } from "@/lib/server-auth";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "View accessible workspaces, risks, decisions, approvals, and milestones in TREVV.",
};

export default async function PortfolioPage() {
  await requireAppSession("/app/portfolio");
  return <PortfolioLoader runtimeMode={webRuntimeMode()} />;
}
