import type { Metadata } from "next";
import { AccountProfileExperience } from "@/components/account-profile";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};
export default async function AccountProfilePage() {
  await requireAppSession("/app/account/profile");
  return (
    <WorkspaceFrame active="settings">
      <AccountProfileExperience />
    </WorkspaceFrame>
  );
}
