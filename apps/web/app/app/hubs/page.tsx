import type { Metadata } from "next";
import { HubsExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "All projects",
  description: "Every responsibility container in the selected Portfolio.",
};

export default function HubsPage() {
  return <HubsExperience />;
}
