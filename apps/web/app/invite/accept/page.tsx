import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InvitationAcceptance } from "@/components/invitation-acceptance";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export const metadata: Metadata = {
  title: "Accept invitation",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>;
}) {
  if (webRuntimeMode() === "demo") redirect("/sign-in");
  const { resume } = await searchParams;
  return <InvitationAcceptance resume={resume === "1"} />;
}
