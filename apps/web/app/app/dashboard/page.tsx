import type { Metadata } from "next";
import { DashboardExperience } from "@/components/dashboard-experience";

export const metadata: Metadata = {
  title: "Dashboard",
  description:
    "Live reporting across every project — status, owners, load, and overdue work.",
};

export default function DashboardPage() {
  return <DashboardExperience />;
}
