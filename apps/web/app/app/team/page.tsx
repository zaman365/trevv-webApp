import type { Metadata } from "next";
import { TeamExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Team pressure",
  description:
    "Cross-Hub workload evidence without timesheets or hourly estimates.",
};

export default function TeamPage() {
  return <TeamExperience />;
}
