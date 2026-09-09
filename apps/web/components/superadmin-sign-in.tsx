"use client";

import { Fingerprint, KeyRound, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  superadminAuthClient,
  superadminRequest,
} from "@/lib/superadmin-client";
import styles from "./superadmin.module.css";

export function SuperadminSignIn({
  mode,
}: {
  mode: "sign-in" | "activate" | "reset";
}) {
  const [token, setToken] = useState("");
  const [email, setEmail] = useState("");
  const [challenge, setChallenge] = useState(false);
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const captured = useRef(false);
  useEffect(() => {
    if (mode === "sign-in" || captured.current) return;
    captured.current = true;
    const data = new URLSearchParams(window.location.hash.slice(1));
    setToken(data.get("token") ?? "");
    setEmail(data.get("email") ?? "");
    window.history.replaceState(null, "", window.location.pathname);
  }, [mode]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "activate") {
        const response = await fetch("/api/superadmin/auth/sign-up/email", {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "content-type": "application/json",
            "x-superadmin-invitation": token,
          },
          body: JSON.stringify({
            name: form.get("name"),
            email,
            password: form.get("password"),
          }),
        });
        if (!response.ok)
          throw new Error(
            "This invitation could not be activated. It may have expired or already been used.",
          );
        setComplete(true);
        setToken("");
        setMessage(
          "Administrator account created. Sign in to enroll your authenticator.",
        );
      } else if (mode === "reset") {
        await superadminRequest("/auth/reset-password", {
          token,
          newPassword: form.get("password"),
        });
        setComplete(true);
        setToken("");
        setMessage(
          "Password updated. Your authenticator or recovery code is still required at sign-in.",
        );
      } else if (challenge) {
        await superadminRequest(
          backup
            ? "/auth/two-factor/verify-backup-code"
            : "/auth/two-factor/verify-totp",
          { code: String(form.get("code")).trim(), trustDevice: false },
        );
        window.location.replace("/superadmin");
      } else {
        const result = await superadminRequest<{ twoFactorRedirect?: boolean }>(
          "/auth/sign-in/email",
          { email, password: form.get("password"), rememberMe: false },
        );
        if (result.twoFactorRedirect) setChallenge(true);
        else window.location.replace("/superadmin/security");
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sign-in could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function passkey() {
    setBusy(true);
    setMessage("");
    try {
      const result = await superadminAuthClient.signIn.passkey();
      if (result.error)
        throw new Error(
          result.error.message ?? "Passkey verification was not completed.",
        );
      window.location.replace("/superadmin");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Passkey verification was not completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function forgotPassword() {
    if (!email) {
      setMessage("Enter your administrator email first.");
      return;
    }
    setBusy(true);
    try {
      await superadminRequest("/auth/request-password-reset", {
        email,
        redirectTo: "/superadmin/reset-password",
      });
      setMessage(
        "If this administrator account exists, a password reset email has been sent.",
      );
    } catch {
      setMessage("Password recovery could not be requested. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${styles.root} ${styles.login}`}>
      <section
        className={styles.loginStory}
        aria-label="TREVV platform administration"
      >
        <Link
          className={styles.brand}
          href="/superadmin/sign-in"
          prefetch={false}
        >
          <span>T</span> TREVV <small>CONTROL</small>
        </Link>
        <div>
          <div className={styles.eyebrow}>PLATFORM ADMINISTRATION</div>
          <h1>
            A clear view.
            <br />
            Careful control.
          </h1>
          <p>
            Manage organisations, invitations and platform access in one private
            space.
          </p>
        </div>
        <p className={styles.storyFoot}>
          <ShieldCheck size={20} /> Separate identity. Verified access.
          Accountable actions.
        </p>
      </section>
      <section className={styles.loginContent}>
        <div className={styles.loginCard}>
          <span className={styles.securityIcon}>
            <KeyRound size={24} />
          </span>
          <p className={styles.eyebrow}>TREVV SUPERADMIN</p>
          <h2>
            {complete
              ? "Ready for the next step"
              : mode === "activate"
                ? "Activate your access"
                : mode === "reset"
                  ? "Choose a new password"
                  : challenge
                    ? "Verify it’s you"
                    : "Administrator sign-in"}
          </h2>
          <p className={styles.muted}>
            {mode === "activate"
              ? "Use your private invitation to create a separate administrator identity."
              : challenge
                ? "Enter a code from your authenticator, or use a saved recovery code."
                : "Use your administrator credentials. Organisation accounts cannot access this space."}
          </p>
          {message && (
            <p className={styles.notice} role="status">
              {message}
            </p>
          )}
          {complete ? (
            <Link
              className={styles.primaryLink}
              href="/superadmin/sign-in"
              prefetch={false}
            >
              Continue to sign-in <ArrowRight size={16} />
            </Link>
          ) : (
            <form onSubmit={submit} className={styles.form}>
              {mode === "activate" && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
              )}
              {mode !== "reset" && !challenge && (
                <label>
                  Administrator email
                  <input
                    name="email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    readOnly={mode === "activate"}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                </label>
              )}
              {challenge ? (
                <label>
                  {backup ? "Recovery code" : "Authenticator code"}
                  <input
                    key={String(backup)}
                    name="code"
                    autoComplete="one-time-code"
                    inputMode={backup ? "text" : "numeric"}
                    pattern={backup ? undefined : "[0-9]{6}"}
                    maxLength={backup ? 64 : 6}
                    required
                    autoFocus
                  />
                </label>
              ) : (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "sign-in" ? "current-password" : "new-password"
                    }
                    minLength={mode === "sign-in" ? 1 : 14}
                    maxLength={128}
                    required
                  />
                  <small>
                    {mode !== "sign-in"
                      ? "Use at least 14 characters. A password manager is welcome."
                      : ""}
                  </small>
                </label>
              )}
              <button
                className={styles.primary}
                type="submit"
                disabled={busy || (mode !== "sign-in" && !token)}
              >
                {busy
                  ? "Please wait…"
                  : mode === "activate"
                    ? "Create administrator account"
                    : mode === "reset"
                      ? "Update password"
                      : challenge
                        ? "Verify and continue"
                        : "Sign in securely"}
                <ArrowRight size={16} />
              </button>
              {mode !== "sign-in" && !token && (
                <p className={styles.muted}>
                  Open the original invitation or reset email to continue.
                </p>
              )}
            </form>
          )}
          {mode === "sign-in" && !challenge && (
            <>
              <div className={styles.divider}>or</div>
              <button
                className={styles.secondary}
                onClick={() => void passkey()}
                disabled={busy}
              >
                <Fingerprint size={19} /> Sign in with a passkey
              </button>
              <button
                className={styles.textButton}
                onClick={() => void forgotPassword()}
                disabled={busy}
              >
                Forgot administrator password?
              </button>
            </>
          )}
          {challenge && (
            <button
              className={styles.textButton}
              onClick={() => setBackup(!backup)}
            >
              {backup ? "Use authenticator instead" : "Use a recovery code"}
            </button>
          )}
          <p className={styles.loginFoot}>
            <ShieldCheck size={15} /> Access is by invitation only.
          </p>
        </div>
      </section>
    </main>
  );
}
