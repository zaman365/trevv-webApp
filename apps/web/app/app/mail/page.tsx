import type { Metadata } from "next";
import { InboxExperience } from "@/components/email-inbox-workflow";
import { WorkspaceFrame } from "@/components/workspace-frame";
import { requireAppSession } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Sample Email",
  description:
    "A fictional mailbox preview with no provider connection or message delivery.",
};

export default async function MailPage() {
  await requireAppSession("/app/mail");
  return (
    <WorkspaceFrame active="mail">
      <main className="focus-main">
        <header className="focus-header">
          <div>
            <p>Communication / Sample Email</p>
            <h1>Fictional mailbox preview</h1>
            <span>
              Explore sample messages and promote one into browser-local work.
              No mailbox is connected and no email is delivered.
            </span>
          </div>
        </header>
        <InboxExperience initialArea="email" />
      </main>
    </WorkspaceFrame>
  );
}
