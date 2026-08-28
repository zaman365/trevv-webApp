import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Import",
  description:
    "Preset-aware CSV migration with mapping, dry run, and complete reporting.",
};

export default function ImportPage() {
  redirect("/app/portfolio");
}
