import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Messages",
  description:
    "Work-context messaging, requests, decisions, and updates within a workspace.",
};

export default function MessagesPage() {
  redirect("/app/portfolio");
}
