import { redirect } from "next/navigation";
import { requireAppSession } from "@/lib/server-auth";

/** Compatibility for saved links from the former hub navigation. */
export default async function LegacyHubsPage() {
  await requireAppSession("/app/hubs");
  redirect("/app/portfolio");
}
