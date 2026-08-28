import type { Metadata } from "next";
import { TeamExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Team pressure",
  description: "Workspace team load and ownership evidence without timesheets.",
};

export default function TeamPage() {
  return <TeamExperience />;
}
