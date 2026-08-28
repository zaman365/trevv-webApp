import type { Metadata } from "next";
import { WorkspacesExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Workspaces",
  description:
    "Choose or create the operational workspace where work and communication belong.",
};

export default function WorkspacesPage() {
  return <WorkspacesExperience />;
}
