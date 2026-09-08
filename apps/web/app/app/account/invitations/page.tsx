import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvitationManagement } from "@/components/invitation-management";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Invitations",
  robots: { index: false, follow: false },
};

export default async function InvitationsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const session = await requireAppSession("/app/account/invitations");
  const params = await searchParams;
  if (!["owner", "admin"].includes(session.organization.role)) notFound();
  return (
    <WorkspaceFrame active="settings">
      <InvitationManagement initialWorkspaceId={params.workspaceId ?? ""} />
    </WorkspaceFrame>
  );
}
