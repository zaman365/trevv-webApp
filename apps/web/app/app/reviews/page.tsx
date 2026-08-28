import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "Optional daily, weekly, and monthly operating rituals with historical snapshots.",
};

export default function ReviewsPage() {
  redirect("/app/portfolio");
}
