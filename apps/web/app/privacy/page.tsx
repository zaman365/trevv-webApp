import type { Metadata } from "next";
import { LegalPreviewNotice } from "@/components/legal-preview-notice";

export const metadata: Metadata = {
  title: "Privacy preview",
  description:
    "Engineering privacy notice for the TREVV fictional-data technical preview.",
  alternates: { canonical: "/privacy" },
  robots: { index: false, follow: false, nocache: true },
};

export default function PrivacyPage() {
  return (
    <LegalPreviewNotice title="Privacy preview notice">
      <section>
        <h2>What is running</h2>
        <p>
          The hosted demonstration uses Cloudflare edge infrastructure and
          fictional sample data. Contract, DPA, processing-region, transfer,
          retention, and legal review are still pending.
        </p>
      </section>
      <section>
        <h2>What is not enabled</h2>
        <p>
          Production PostgreSQL, SMTP, error tracking, private object storage,
          billing, and product integrations have not been selected or enabled.
          No provider connection, external write, or automated provider
          revocation should be inferred from this preview.
        </p>
      </section>
      <section>
        <h2>Data lifecycle</h2>
        <p>
          Authenticated live-mode accounts can submit a versioned privacy
          request. “Submitted” means accepted for human review only; it does not
          mean that data was exported, erased, rectified, restricted, or
          revoked. Completion remains disabled until legal, storage, backup,
          identity-verification, and provider-specific controls pass review.
        </p>
      </section>
      <section>
        <h2>Before public beta</h2>
        <ul>
          <li>Name the controller/operator and privacy contact.</li>
          <li>
            Publish reviewed retention, DPA, region, and subprocessors details.
          </li>
          <li>
            Prove tenant-safe export, deletion, backup, and restore drills.
          </li>
        </ul>
      </section>
    </LegalPreviewNotice>
  );
}
