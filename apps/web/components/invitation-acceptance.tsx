"use client";

import { MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trevvBrand } from "@/lib/branding";

export function InvitationAcceptance({ resume }: { resume: boolean }) {
  const attempted = useRef(false);
  const [message, setMessage] = useState(
    resume
      ? "Validating your invitation…"
      : "This invitation link is missing or no longer available.",
  );
  const [failed, setFailed] = useState(!resume);
  const [retryable, setRetryable] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!resume) return;
    void accept();

    async function accept() {
      try {
        const response = await fetch("/api/web/invitations/accept", {
          method: "POST",
          credentials: "same-origin",
        });
        if (response.status === 401) {
          window.location.replace(
            `/sign-in?next=${encodeURIComponent("/invite/accept?resume=1")}`,
          );
          return;
        }
        if (!response.ok) {
          const body: unknown = await response.json().catch(() => null);
          setMessage(inviteAcceptanceError(body));
          setRetryable(response.status === 429 || response.status >= 500);
          setFailed(true);
          return;
        }
        setMessage("Invitation accepted. Opening your organization…");
        window.location.replace("/app/portfolio");
      } catch {
        setMessage("The invitation could not be checked. Try the link again.");
        setRetryable(true);
        setFailed(true);
      }
    }
  }, [resume]);

  return (
    <main className="public-auth-page">
      <section className="public-auth-card invitation-acceptance-card">
        <a className="auth-brand" href="/sign-in">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </a>
        <span className="onboarding-icon">
          {failed ? <ShieldCheck size={18} /> : <MailCheck size={18} />}
        </span>
        <h1>{failed ? "Invitation unavailable" : "Accept invitation"}</h1>
        <p role="status">{message}</p>
        {failed ? (
          <a
            className="auth-card-link"
            href={retryable ? "/invite/accept?resume=1" : "/sign-in"}
          >
            {retryable ? "Try invitation again" : "Sign in to TREVV"}
          </a>
        ) : null}
      </section>
    </main>
  );
}

function inviteAcceptanceError(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    typeof (value as { error?: unknown }).error === "string"
  )
    return (value as { error: string }).error;
  return "This invitation is invalid, expired, revoked, or already used.";
}
