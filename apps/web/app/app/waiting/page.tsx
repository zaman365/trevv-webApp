import type { Metadata } from "next";
import { WaitingExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Waiting",
  description:
    "Internal and external dependencies with expected dates and follow-up ownership.",
};

export default function WaitingPage() {
  return <WaitingExperience />;
}
