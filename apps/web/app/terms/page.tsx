import type { Metadata } from "next";
import { LegalPreviewNotice } from "@/components/legal-preview-notice";

export const metadata: Metadata = {
  title: "Terms preview",
  description:
    "Engineering terms notice for the TREVV fictional-data technical preview.",
  alternates: { canonical: "/terms" },
  robots: { index: false, follow: false, nocache: true },
};

export default function TermsPage() {
  return (
    <LegalPreviewNotice title="Terms preview notice">
      <section>
        <h2>Preview purpose</h2>
        <p>
          TREVV is currently a fictional-data technical preview intended for
          product evaluation and engineering validation. It is not ready for
          production, regulated, confidential, or business-critical use.
        </p>
      </section>
      <section>
        <h2>No durable or external promise</h2>
        <p>
          Unless a control is explicitly marked live and confirmed by the
          server, preview actions do not promise persistence, delivery,
          publication, import, provider connection, revocation, or billing.
          External integrations and payments remain disabled.
        </p>
      </section>
      <section>
        <h2>Safe evaluation</h2>
        <ul>
          <li>Use fictional data only.</li>
          <li>Do not rely on the preview as a system of record.</li>
          <li>
            Do not use it for personnel, financial, medical, or legal decisions.
          </li>
        </ul>
      </section>
      <section>
        <h2>Review status</h2>
        <p>
          Provider responsibilities, support, availability, liability,
          acceptable use, governing law, DPA, and commercial terms require legal
          and commercial approval before a public beta.
        </p>
      </section>
    </LegalPreviewNotice>
  );
}
