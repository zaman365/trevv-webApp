import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Notifications",
  description:
    "Informational activity kept separate from the actionable Inbox.",
};

export default function NotificationsPage() {
  redirect("/app/portfolio");
}
