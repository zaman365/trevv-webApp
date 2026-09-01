import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlatformAdmin } from "@/components/platform-admin";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Platform control",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PlatformAdminPage() {
  const session = await requireAppSession("/app/system/admin");
  if (session.platformRole !== "owner") notFound();

  return (
    <WorkspaceFrame active="platform">
      <PlatformAdmin />
    </WorkspaceFrame>
  );
}
