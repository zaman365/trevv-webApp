import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Attention",
  description:
    "Explainable operational signals ranked by impact, urgency, and responsibility.",
};

export default function AttentionPage() {
  redirect("/app/portfolio");
}
