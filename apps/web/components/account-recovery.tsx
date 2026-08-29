"use client";

import { ArrowRight, KeyRound, MailCheck } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { trevvBrand } from "@/lib/branding";

export function ForgotPasswordExperience() {
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);
  const [message, setMessage] = useState("");

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
    setMessage("");
    try {
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
      setMessage("The reset request could not be sent. Try again.");
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
          <p>
            If an account exists for that address, TREVV sent a time-limited
            reset link. The message is intentionally the same for every address.
          </p>
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
    setMessage("");
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
        : "The password could not be reset. Try again.",
    );
    setPending(false);
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
  email,
  resume,
  returnTo,
}: {
  email?: string;
  resume: boolean;
  returnTo: string;
}) {
  const attempted = useRef(false);
  const [pending, setPending] = useState(resume);
  const [message, setMessage] = useState(resume ? "Verifying your email…" : "");

  useEffect(() => {
    if (!resume || attempted.current) return;
    attempted.current = true;
    void fetch("/api/web/verify-email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ returnTo }),
    })
      .then(async (response) => {
        if (response.ok) {
          window.location.replace(returnTo);
          return;
        }
        const body: unknown = await response.json().catch(() => null);
        setMessage(
          publicAuthError(
            body,
            "This verification link is invalid, expired, or already used.",
          ),
        );
        setPending(false);
      })
      .catch(() => {
        setMessage("Your email could not be verified. Try again.");
        setPending(false);
      });
  }, [resume, returnTo]);

  async function resend() {
    if (!email) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          callbackURL: new URL(returnTo, window.location.origin).toString(),
        }),
      });
      setMessage(
        response.status < 500
          ? "If that address has a pending account, TREVV will send another link. Each link is one-time and time-limited."
          : "The verification request is temporarily unavailable. Try again shortly.",
      );
    } catch {
      setMessage(
        "The verification request is temporarily unavailable. Try again shortly.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <PublicAuthShell icon={<MailCheck size={18} />} title="Verify your email">
      <div className="auth-confirmation">
        <p>
          {resume
            ? "TREVV is validating this one-time link."
            : `Open the time-limited verification link sent${email ? ` to ${email}` : " to your email"}.`}
        </p>
        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        {!resume && email ? (
          <button
            className="primary-button"
            disabled={pending}
            onClick={() => void resend()}
            type="button"
          >
            {pending ? "Sending…" : "Resend verification email"}
          </button>
        ) : null}
        {!resume ? (
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
