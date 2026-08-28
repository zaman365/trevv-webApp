import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Portfolio",
  description:
    "Cumulative health, work, decisions, milestones, and updates across every workspace in a portfolio.",
};

export default function HomePage() {
  redirect("/app/portfolio");
}
