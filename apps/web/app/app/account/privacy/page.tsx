import type { Metadata } from "next";
import { PrivacyCenter } from "@/components/privacy-center";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Privacy center",
  robots: { index: false, follow: false, noarchive: true },
};

export default async function PrivacyCenterPage() {
  await requireAppSession("/app/account/privacy");
  return (
    <WorkspaceFrame active="settings">
      <PrivacyCenter />
    </WorkspaceFrame>
  );
}
