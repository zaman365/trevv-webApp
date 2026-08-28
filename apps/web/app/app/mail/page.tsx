import type { Metadata } from "next";
import { InboxExperience } from "@/components/email-inbox-workflow";
import { WorkspaceFrame } from "@/components/workspace-frame";

export const metadata: Metadata = {
  title: "Email",
  description:
    "A connected mailbox for Gmail, Microsoft, Yahoo, iCloud, and custom domains.",
};

export default function MailPage() {
  return (
    <WorkspaceFrame active="mail">
      <main className="focus-main">
        <header className="focus-header">
          <div>
            <p>Communication / Email</p>
            <h1>Email</h1>
            <span>
              Read and send account-level email. Promote only messages that need
              tracked Workspace action.
            </span>
          </div>
        </header>
        <InboxExperience initialArea="email" />
      </main>
    </WorkspaceFrame>
  );
}
