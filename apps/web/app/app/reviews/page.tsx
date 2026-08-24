import type { Metadata } from "next";
import { ReviewsExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Reviews",
  description:
    "Optional daily, weekly, and monthly operating rituals with historical snapshots.",
};

export default function ReviewsPage() {
  return <ReviewsExperience />;
}
