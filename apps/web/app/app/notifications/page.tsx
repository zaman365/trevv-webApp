import type { Metadata } from "next";
import { NotificationsExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Notifications",
  description:
    "Informational activity kept separate from the actionable Inbox.",
};

export default function NotificationsPage() {
  return <NotificationsExperience />;
}
