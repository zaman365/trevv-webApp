import type { Metadata } from "next";
import { DashboardExperience } from "@/components/dashboard-experience";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Access-aware reporting within the selected workspace.",
};

export default function DashboardPage() {
  return <DashboardExperience />;
}
