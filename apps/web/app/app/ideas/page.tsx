import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Ideas & evidence",
  description:
    "Lightweight opportunity discovery with linked operational evidence and provenance.",
};

export default function IdeasPage() {
  redirect("/app/portfolio");
}
