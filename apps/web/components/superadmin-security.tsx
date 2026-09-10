"use client";

import {
  Fingerprint,
  KeyRound,
  LockKeyhole,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { SuperadminSession } from "@founderhq/api-contract";
import {
  superadminAuthClient,
  superadminRequest,
} from "@/lib/superadmin-client";
import styles from "./superadmin.module.css";

type SessionRow = {
  id: string;
  createdAt: string;
  expiresAt: string;
  current: boolean;
};
type PasskeyRow = { id: string; name?: string | null };
async function readSecurity() {
  const current = await superadminRequest<SuperadminSession>("/session");
  if (!current.twoFactorEnabled || !current.assuranceAt)
    return { current, sessions: [] as SessionRow[], keys: [] as PasskeyRow[] };
  const active = await superadminRequest<{ items: SessionRow[] }>(
    "/security/sessions",
  );
  // Only names and identifiers are returned; credential public keys stay on the server.
  const result = await superadminAuthClient.passkey.listUserPasskeys();
  return {
    current,
    sessions: active.items,
    keys:
      result.data?.map((key) => ({ id: key.id, name: key.name ?? null })) ?? [],
  };
}
export function SuperadminSecurity({
  session: initial,
}: {
  session: SuperadminSession;
}) {
  const [session, setSession] = useState(initial);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [totpURI, setTotpURI] = useState(""),
    [codes, setCodes] = useState<string[]>([]);
  const [keys, setKeys] = useState<PasskeyRow[]>([]),
    [sessions, setSessions] = useState<SessionRow[]>([]);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);
  const [phone, setPhone] = useState(initial.phoneNumber ?? "");
  const enrolled = session.twoFactorEnabled && !!session.assuranceAt;
  const applySecurity = useCallback(
    (value: Awaited<ReturnType<typeof readSecurity>>) => {
      setNow(Date.now());
      setSession(value.current);
      setSessions(value.sessions);
      setKeys(value.keys);
    },
    [],
  );
  async function loadSecurity() {
    applySecurity(await readSecurity());
  }
  useEffect(() => {
    let active = true;
    void readSecurity()
      .then((value) => {
        if (active) applySecurity(value);
      })
      .catch(() => {
        if (active)
          setMessage(
            "Security information could not be loaded. Verify your authenticator to refresh access.",
          );
      });
    return () => {
      active = false;
    };
  }, [applySecurity]);
  async function perform(action: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await loadSecurity();
      setMessage(success);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The security change could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function enable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = new FormData(event.currentTarget).get("password");
    await perform(async () => {
      const result = await superadminRequest<{
        totpURI: string;
        backupCodes: string[];
      }>("/auth/two-factor/enable", { password, method: "totp" });
      setTotpURI(result.totpURI);
      setCodes(result.backupCodes);
    }, "Scan the code or enter the setup key, then verify a code from your authenticator.");
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    await perform(async () => {
      await superadminRequest("/auth/two-factor/verify-totp", {
        code,
        trustDevice: false,
      });
      setTotpURI("");
    }, "Authenticator verified. Sensitive actions are available for ten minutes.");
  }
  async function addPasskey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    await perform(async () => {
      const result = await superadminAuthClient.passkey.addPasskey({ name });
      if (result.error)
        throw new Error(
          result.error.message ?? "Passkey registration was not completed.",
        );
    }, "Passkey added. You can use it at administrator sign-in.");
  }
  async function removePasskey(id: string) {
    if (
      !window.confirm(
        "Remove this administrator passkey? Keep your authenticator and recovery codes available.",
      )
    )
      return;
    await perform(async () => {
      const result = await superadminAuthClient.passkey.deletePasskey({ id });
      if (result.error)
        throw new Error(
          result.error.message ?? "Passkey could not be removed.",
        );
    }, "Passkey removed.");
  }
  const setupKey = totpURI ? new URL(totpURI).searchParams.get("secret") : "";
  return (
    <main>
      <header className={styles.heading}>
        <div>
          <h1>
            {enrolled
              ? "Your administrator security"
              : "Secure your administrator account"}
          </h1>
          <p>
            {enrolled
              ? "Manage your sign-in methods and verify sensitive changes."
              : "Enroll an authenticator before accessing platform information. Keep the recovery codes somewhere safe."}
          </p>
        </div>
        {enrolled && (
          <Link
            href="/superadmin"
            className={styles.secondary}
            prefetch={false}
          >
            Open platform overview
          </Link>
        )}
      </header>
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      {enrolled && (
        <section className={styles.metrics} aria-label="Your security status">
          <article className={styles.metric}>
            <p>Current session</p>
            <strong>{session.role}</strong>
            <span>
              Expires{" "}
              {new Date(session.expiresAt).toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              })}{" "}
              UTC
            </span>
          </article>
          <article className={styles.metric}>
            <p>Sensitive actions</p>
            <strong>
              {now === null
                ? "Checking…"
                : session.assuranceAt &&
                    now - Date.parse(session.assuranceAt) < 600_000
                  ? "Verified"
                  : "Verify again"}
            </strong>
            <span>Reverify below to edit profiles or view contacts</span>
          </article>
          <article className={styles.metric}>
            <p>Passkeys</p>
            <strong>{keys.length}</strong>
            <span>
              {keys.length
                ? "Registered on your account"
                : "Add a passkey for another sign-in option"}
            </span>
          </article>
          <article className={styles.metric}>
            <p>Contact phone</p>
            <strong>{session.phoneNumber ? "Added" : "Optional"}</strong>
            <span>Contact only · not verified for sign-in</span>
          </article>
        </section>
      )}
      <div className={styles.securityGrid}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Authenticator app</h2>
              <p>
                {enrolled
                  ? "Required for password sign-in"
                  : "Step 1 · Add your authenticator"}
              </p>
            </div>
            <ShieldCheck size={22} />
          </header>
          <div className={styles.panelBody}>
            {!session.twoFactorEnabled && !totpURI && (
              <form className={styles.form} onSubmit={enable}>
                <p className={styles.muted}>
                  Use an authenticator such as your password manager or a TOTP
                  app. Codes are generated on your device.
                </p>
                <label>
                  Administrator password
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    maxLength={128}
                  />
                </label>
                <button className={styles.primary} disabled={busy}>
                  Set up authenticator
                </button>
              </form>
            )}
            {totpURI && (
              <>
                <div
                  style={{
                    background: "white",
                    padding: "1rem",
                    display: "inline-block",
                  }}
                >
                  <QRCodeSVG
                    value={totpURI}
                    size={200}
                    title="Scan this private authenticator setup code"
                  />
                </div>
                <p className={styles.muted}>
                  Or enter this setup key manually:
                </p>
                <code className={styles.code}>{setupKey}</code>
              </>
            )}
            {(session.twoFactorEnabled || totpURI) && (
              <form className={styles.form} onSubmit={verify}>
                <label>
                  Six-digit authenticator code
                  <input
                    name="code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </label>
                <button className={styles.primary} disabled={busy}>
                  {enrolled
                    ? "Verify sensitive actions"
                    : "Verify and activate access"}
                </button>
                <p className={styles.muted}>
                  Verification unlocks sensitive changes for ten minutes.
                  Platform sessions expire after four hours.
                </p>
              </form>
            )}
          </div>
        </section>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Recovery codes</h2>
              <p>Use a code if your authenticator is unavailable</p>
            </div>
            <KeyRound size={22} />
          </header>
          <div className={styles.panelBody}>
            {codes.length > 0 ? (
              <>
                <p className={styles.muted}>
                  Save these now. Each code works once and must be kept private.
                </p>
                <div className={styles.recovery} style={{ marginTop: "1rem" }}>
                  {codes.map((code) => (
                    <code key={code}>{code}</code>
                  ))}
                </div>
                <button
                  className={styles.secondary}
                  style={{ marginTop: "1rem" }}
                  onClick={() => setCodes([])}
                >
                  I have saved my recovery codes
                </button>
              </>
            ) : (
              <>
                <p className={styles.muted}>
                  Generating new codes replaces your previous recovery codes.
                  They are shown only when generated.
                </p>
                {enrolled && (
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      const password = new FormData(event.currentTarget).get(
                        "password",
                      );
                      void perform(async () => {
                        const result = await superadminRequest<{
                          backupCodes: string[];
                        }>("/auth/two-factor/generate-backup-codes", {
                          password,
                        });
                        setCodes(result.backupCodes);
                      }, "New recovery codes generated. Save them securely.");
                    }}
                  >
                    <label>
                      Confirm password
                      <input
                        name="password"
                        type="password"
                        autoComplete="current-password"
                        required
                      />
                    </label>
                    <button className={styles.secondary} disabled={busy}>
                      Generate new recovery codes
                    </button>
                  </form>
                )}
                {!enrolled && (
                  <p className={styles.privacyFoot}>
                    Your codes appear during authenticator setup.
                  </p>
                )}
              </>
            )}
          </div>
        </section>
        {enrolled && (
          <>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Passkeys</h2>
                  <p>Sign in with device verification or a security key</p>
                </div>
                <Fingerprint size={22} />
              </header>
              <div className={styles.panelBody}>
                <ul className={styles.securityList}>
                  {keys.map((key) => (
                    <li key={key.id}>
                      <span>{key.name || "Administrator passkey"}</span>
                      <button
                        className={styles.textButton}
                        disabled={busy}
                        onClick={() => void removePasskey(key.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                {keys.length === 0 && (
                  <p className={styles.muted}>No passkeys registered yet.</p>
                )}
                <form className={styles.form} onSubmit={addPasskey}>
                  <label>
                    Passkey label
                    <input
                      name="name"
                      placeholder="My MacBook or security key"
                      maxLength={60}
                      required
                    />
                  </label>
                  <button className={styles.secondary} disabled={busy}>
                    <PlusIcon />
                    Add passkey
                  </button>
                </form>
              </div>
            </section>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Contact phone</h2>
                  <p>Optional · not a sign-in or recovery method</p>
                </div>
                <Phone size={21} />
              </header>
              <div className={styles.panelBody}>
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void perform(async () => {
                      await superadminRequest(
                        "/security/phone",
                        { phoneNumber: phone.trim() || null },
                        "PATCH",
                      );
                    }, "Contact phone saved. It has not been verified and cannot recover your account.");
                  }}
                >
                  <label>
                    Phone number
                    <input
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="+49…"
                      pattern="\+[1-9][0-9]{6,14}"
                      maxLength={16}
                      value={phone}
                      onChange={(event) => setPhone(event.target.value)}
                    />
                    <small>
                      Include the country code. Leave empty to remove it.
                    </small>
                  </label>
                  <button className={styles.secondary} disabled={busy}>
                    Save contact number
                  </button>
                  <p className={styles.muted}>
                    SMS verification is not enabled. This number is never shared
                    with customer organisations.
                  </p>
                </form>
              </div>
            </section>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Administrator sessions</h2>
                  <p>Your active sign-ins, without location tracking</p>
                </div>
                <LockKeyhole size={21} />
              </header>
              <div className={styles.panelBody}>
                <ul className={styles.securityList}>
                  {sessions.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.current
                          ? "This session"
                          : "Other administrator session"}
                        <small>
                          Expires{" "}
                          {new Date(item.expiresAt).toLocaleString("en-GB")}
                        </small>
                      </span>
                      {item.current && (
                        <span className={styles.badge}>Current</span>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  className={styles.secondary}
                  style={{ marginTop: "1rem" }}
                  disabled={busy || sessions.length < 2}
                  onClick={() =>
                    void perform(async () => {
                      await superadminRequest("/security/revoke-sessions", {});
                    }, "Other administrator sessions revoked.")
                  }
                >
                  Revoke other sessions
                </button>
              </div>
            </section>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Administrator password</h2>
                  <p>Separate from your TREVV workspace password</p>
                </div>
                <KeyRound size={21} />
              </header>
              <div className={styles.panelBody}>
                <form
                  className={styles.form}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    void perform(async () => {
                      await superadminRequest("/auth/change-password", {
                        currentPassword: form.get("current"),
                        newPassword: form.get("new"),
                        revokeOtherSessions: true,
                      });
                    }, "Password changed. Other administrator sessions were revoked.");
                  }}
                >
                  <label>
                    Current password
                    <input
                      name="current"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                  <label>
                    New password
                    <input
                      name="new"
                      type="password"
                      autoComplete="new-password"
                      minLength={14}
                      maxLength={128}
                      required
                    />
                    <small>At least 14 characters.</small>
                  </label>
                  <button className={styles.secondary} disabled={busy}>
                    Change password
                  </button>
                </form>
              </div>
            </section>
          </>
        )}
      </div>
      <p className={styles.privacyFoot}>
        <ShieldCheck size={16} />
        Your administrator identity grants no customer workspace membership.
        Keep authentication secrets and recovery codes private.
      </p>
    </main>
  );
}
function PlusIcon() {
  return <Fingerprint size={17} />;
}
