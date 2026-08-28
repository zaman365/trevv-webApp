import type { Metadata } from "next";
import { HomeExperience } from "@/components/management-experience";

export const metadata: Metadata = {
  title: "Home",
  description:
    "Personalized focus, meaningful changes, decisions, and waiting follow-ups.",
};

export default function HomePage() {
  return <HomeExperience />;
}
