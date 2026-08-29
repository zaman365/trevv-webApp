import type { Metadata } from "next";
import { SessionManagement } from "@/components/session-management";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Active sessions",
  robots: { index: false, follow: false },
};

export default async function SessionsPage() {
  await requireAppSession("/app/account/sessions");
  return (
    <WorkspaceFrame active="settings">
      <SessionManagement />
    </WorkspaceFrame>
  );
}
