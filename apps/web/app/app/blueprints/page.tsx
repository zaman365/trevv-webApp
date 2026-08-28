import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Blueprints",
  description: "Managed operating templates with safe, selective improvements.",
};

export default function BlueprintsPage() {
  redirect("/app/portfolio");
}
