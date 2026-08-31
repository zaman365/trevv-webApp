"use client";

import { ArrowRight, KeyRound, MailCheck } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { trevvBrand } from "@/lib/branding";
import { warmLiveApiReadiness } from "@/lib/live-api-readiness";

export const passwordResetDeliveryMessage =
  "If an account exists and delivery succeeds, a time-limited reset link may arrive. If no message arrives, wait a moment and try again. The response is intentionally the same for every address.";

export function ForgotPasswordExperience() {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    void warmLiveApiReadiness();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    setPending(true);
    setMessage(
      "Preparing secure services. No password-reset request has been sent yet.",
    );
    try {
      if (!(await warmLiveApiReadiness())) {
        setMessage(
          "The secure services did not become ready in time. No reset request was sent. Try again.",
        );
        return;
      }
      const response = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      });
      if (!response.ok) throw new Error("The reset request could not be sent.");
      setComplete(true);
    } catch {
      setMessage(
        "The reset request could not be confirmed. If an account exists, a link may still arrive; wait a moment before trying again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicAuthShell icon={<KeyRound size={18} />} title="Reset your password">
      {complete ? (
        <div className="auth-confirmation" role="status">
          <MailCheck size={22} />
          <h2>Check your email</h2>
          <p>{passwordResetDeliveryMessage}</p>
          <a href="/sign-in">Return to sign in</a>
        </div>
      ) : (
        <form onSubmit={submit}>
          <p>Enter the email used for your TREVV account.</p>
          <label>
            <span>Email</span>
            <input
              autoComplete="email"
              disabled={pending}
              name="email"
              required
              type="email"
            />
          </label>
          {message ? (
            <p className="auth-message" role="status">
              {message}
            </p>
          ) : null}
          <button className="primary-button" disabled={pending} type="submit">
            {pending ? "Sending…" : "Send reset link"} <ArrowRight size={14} />
          </button>
          <a className="auth-card-link" href="/sign-in">
            Back to sign in
          </a>
        </form>
      )}
    </PublicAuthShell>
  );
}

export function ResetPasswordExperience({
  invalid,
  resume,
}: {
  invalid: boolean;
  resume: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(
    resume
      ? ""
      : invalid
        ? "This reset link is invalid, expired, or has already been used."
        : "This reset link is missing its token. Request a new one.",
  );

  useEffect(() => {
    if (resume) void warmLiveApiReadiness();
  }, [resume]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resume) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 12) {
      setMessage("Use at least 12 characters for your new password.");
      return;
    }
    if (password.length > 128) {
      setMessage("Use at most 128 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setMessage("The password confirmation does not match.");
      return;
    }
    setPending(true);
    setMessage(
      "Preparing secure services. Your password has not been changed yet.",
    );
    try {
      if (!(await warmLiveApiReadiness())) {
        setMessage(
          "The secure services did not become ready in time. Your password was not changed. Try again.",
        );
        return;
      }
      const response = await fetch("/api/web/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ newPassword: password }),
      });
      if (response.ok) {
        window.location.replace("/sign-in?reset=1");
        return;
      }
      setMessage(
        response.status === 400 || response.status === 401
          ? "This reset link is invalid, expired, or has already been used."
          : "The password could not be reset. No password change was confirmed. Try again.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The password could not be reset. No password change was confirmed. Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicAuthShell
      icon={<KeyRound size={18} />}
      title="Choose a new password"
    >
      <form onSubmit={submit}>
        <label>
          <span>New password</span>
          <input
            autoComplete="new-password"
            disabled={pending || !resume}
            maxLength={128}
            minLength={12}
            name="password"
            required
            type="password"
          />
        </label>
        <label>
          <span>Confirm new password</span>
          <input
            autoComplete="new-password"
            disabled={pending || !resume}
            maxLength={128}
            minLength={12}
            name="confirmation"
            required
            type="password"
          />
        </label>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        <button
          className="primary-button"
          disabled={pending || !resume}
          type="submit"
        >
          {pending ? "Resetting…" : "Reset password"}
        </button>
        {!resume ? (
          <a className="auth-card-link" href="/forgot-password">
            Request a new link
          </a>
        ) : null}
      </form>
    </PublicAuthShell>
  );
}

export function VerifyEmailExperience({
  deliveryFailed = false,
  email,
  resume,
  returnTo,
}: {
  deliveryFailed?: boolean;
  email?: string;
  resume: boolean;
  returnTo: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(resume);
  const [retryable, setRetryable] = useState(false);
  const [resendEmail, setResendEmail] = useState(email ?? "");
  const [message, setMessage] = useState(
    resume
      ? "Verifying your email…"
      : deliveryFailed
        ? "Your account was created, but the verification email could not be delivered. Request another link below."
        : "",
  );

  useEffect(() => {
    if (!resume) {
      void warmLiveApiReadiness();
      return;
    }
    let active = true;
    void verify();

    async function verify() {
      setPending(true);
      setRetryable(false);
      setMessage(
        "Preparing secure services. Your email has not been verified yet.",
      );
      try {
        if (!(await warmLiveApiReadiness())) {
          if (!active) return;
          setMessage(
            "The secure services did not become ready in time. Your verification link was not submitted. Try verification again.",
          );
          setRetryable(true);
          setPending(false);
          return;
        }
        if (!active) return;
        setMessage("Secure services are ready. Verifying your email…");
        const response = await fetch("/api/web/verify-email", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ returnTo }),
        });
        if (response.ok) {
          window.location.replace(returnTo);
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        if (!active) return;
        setMessage(
          publicAuthError(
            body,
            "This verification link is invalid, expired, or already used.",
          ),
        );
        setRetryable(response.status === 429 || response.status >= 500);
        setPending(false);
      } catch {
        if (!active) return;
        setMessage(
          "Your email could not be verified, and no verification was confirmed. Try verification again.",
        );
        setRetryable(true);
        setPending(false);
      }
    }

    return () => {
      active = false;
    };
  }, [attempt, resume, returnTo]);

  async function resend() {
    const normalizedEmail = resendEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setMessage("Enter a valid email address to request a new link.");
      return;
    }
    setPending(true);
    setMessage(
      "Preparing secure services. No verification email has been requested yet.",
    );
    try {
      if (!(await warmLiveApiReadiness())) {
        setMessage(
          "The secure services did not become ready in time. No verification email was requested. Try again.",
        );
        return;
      }
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email: normalizedEmail,
          callbackURL: new URL(returnTo, window.location.origin).toString(),
        }),
      });
      setMessage(verificationResendMessage(response));
    } catch {
      setMessage(
        "The verification request could not be confirmed. A message may still arrive; wait a moment before trying again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicAuthShell icon={<MailCheck size={18} />} title="Verify your email">
      <div className="auth-confirmation">
        <p>
          {resume && pending
            ? "TREVV is validating this one-time link."
            : resume
              ? "If this link cannot be used, request a new time-limited verification link below."
              : deliveryFailed
                ? "No verification email was delivered for this account."
                : `Open the time-limited verification link sent${email ? ` to ${email}` : " to your email"}.`}
        </p>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        {resume && retryable ? (
          <button
            className="primary-button"
            disabled={pending}
            onClick={() => setAttempt((current) => current + 1)}
            type="button"
          >
            Retry verification
          </button>
        ) : null}
        {!pending ? (
          <form
            className="verification-resend-form"
            onSubmit={(event) => {
              event.preventDefault();
              void resend();
            }}
          >
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                disabled={pending}
                inputMode="email"
                onChange={(event) => setResendEmail(event.target.value)}
                required
                type="email"
                value={resendEmail}
              />
            </label>
            <button className="primary-button" disabled={pending} type="submit">
              Resend verification email
            </button>
          </form>
        ) : null}
        {!resume || !pending ? (
          <a
            className="auth-card-link"
            href={`/sign-in?next=${encodeURIComponent(returnTo)}`}
          >
            Return to sign in
          </a>
        ) : null}
      </div>
    </PublicAuthShell>
  );
}

export function verificationResendMessage(response: {
  ok: boolean;
  status: number;
}): string {
  if (response.ok)
    return "If that address has a pending account and delivery succeeds, a new one-time link may arrive. If no link arrives, wait a moment and try again.";
  if (response.status === 429)
    return "Too many verification requests. Wait a moment and try again.";
  return "The verification request is temporarily unavailable. Try again shortly.";
}

function publicAuthError(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    typeof (value as { error?: unknown }).error === "string"
    ? (value as { error: string }).error
    : fallback;
}

function PublicAuthShell({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <main className="public-auth-page">
      <section className="public-auth-card">
        <a className="auth-brand" href="/sign-in">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </a>
        <span className="onboarding-icon">{icon}</span>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
