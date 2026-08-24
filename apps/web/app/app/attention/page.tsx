import type { Metadata } from "next";
import { AttentionExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Attention",
  description:
    "Explainable operational signals ranked by impact, urgency, and responsibility.",
};

export default function AttentionPage() {
  return <AttentionExperience />;
}
