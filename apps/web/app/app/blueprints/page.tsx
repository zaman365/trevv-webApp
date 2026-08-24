import type { Metadata } from "next";
import { BlueprintsExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Blueprints",
  description: "Managed operating templates with safe, selective improvements.",
};

export default function BlueprintsPage() {
  return <BlueprintsExperience />;
}
