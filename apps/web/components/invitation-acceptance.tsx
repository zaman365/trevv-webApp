"use client";

import { MailCheck, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trevvBrand } from "@/lib/branding";
import { waitForLiveApiReadiness } from "@/lib/live-api-readiness";

export function InvitationAcceptance({ resume }: { resume: boolean }) {
  const attempted = useRef(false);
  const [message, setMessage] = useState(
    resume
      ? "Preparing secure invitation acceptance…"
      : "This invitation link is missing or no longer available.",
  );
  const [failed, setFailed] = useState(!resume);
  const [retryable, setRetryable] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;
    if (!resume) return;
    void accept();

    async function accept() {
      try {
        setMessage(
          "Waking the secure preview services. Free-preview startup can take up to two minutes. No invitation change has happened yet.",
        );
        const ready = await waitForLiveApiReadiness();
        if (!ready) {
          setMessage(
            "The secure services did not become ready in time. Your invitation was not accepted. Try again.",
          );
          setRetryable(true);
          setFailed(true);
          return;
        }
        setMessage("Secure services are ready. Validating your invitation…");
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
        setMessage(
          "The invitation could not be checked, and no membership change was confirmed. Try again.",
        );
        setRetryable(true);
        setFailed(true);
      }
    }
  }, [resume]);

  async function signOutForRecovery() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/web/sign-out", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: "{}",
      });
      if (!response.ok)
        throw new Error("The current account could not be signed out.");
      window.location.replace("/sign-in");
    } catch {
      setMessage(
        "This invitation needs a replacement from the Workspace owner. TREVV could not sign out the current account; try again before using another invited address.",
      );
      setSigningOut(false);
    }
  }

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
        <h1>
          {failed
            ? retryable
              ? "Invitation not confirmed"
              : "Invitation unavailable"
            : "Accept invitation"}
        </h1>
        <p role="status">{message}</p>
        {failed && retryable ? (
          <a className="auth-card-link" href="/invite/accept?resume=1">
            Try invitation again
          </a>
        ) : null}
        {failed && !retryable && resume ? (
          <div className="invitation-recovery-actions">
            <p>
              Ask the Workspace owner to send a replacement invitation. If this
              invitation belongs to another email address, sign out before
              opening the replacement link.
            </p>
            <button
              className="primary-button"
              disabled={signingOut}
              onClick={() => void signOutForRecovery()}
              type="button"
            >
              {signingOut ? "Signing out…" : "Sign out and switch account"}
            </button>
          </div>
        ) : null}
        {failed && !retryable && !resume ? (
          <a className="auth-card-link" href="/sign-in">
            Sign in to TREVV
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
