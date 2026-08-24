import type { Metadata } from "next";
import { IdeasExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Ideas & evidence",
  description:
    "Lightweight opportunity discovery with linked operational evidence and provenance.",
};

export default function IdeasPage() {
  return <IdeasExperience />;
}
