import type { Metadata } from "next";
import { DashboardExperience } from "@/components/dashboard-experience";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Access-aware reporting across portfolio, project, team, and personal views.",
};

export default function DashboardPage() {
  return <DashboardExperience />;
}
