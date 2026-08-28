import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Team pressure",
  description: "Workspace team load and ownership evidence without timesheets.",
};

export default function TeamPage() {
  redirect("/app/portfolio");
}
