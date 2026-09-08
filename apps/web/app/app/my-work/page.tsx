import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireAppSession } from "@/lib/server-auth";
import { LivePersonalWork } from "@/components/live-personal-work";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "My Work",
  description: "Your tasks across every workspace in this organization.",
};

export default async function PersonalWorkPage() {
  await requireAppSession("/app/my-work");
  if (webRuntimeMode() !== "live") redirect("/app/portfolio");
  return <LivePersonalWork />;
}
