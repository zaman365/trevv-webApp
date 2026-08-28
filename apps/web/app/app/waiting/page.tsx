import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Waiting",
  description:
    "Internal and external dependencies with expected dates and follow-up ownership.",
};

export default function WaitingPage() {
  redirect("/app/portfolio");
}
