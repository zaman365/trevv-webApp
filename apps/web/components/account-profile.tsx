"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, LockKeyhole, Save, UserRound } from "lucide-react";
import {
  parseProfileUpdate,
  profileFieldLimits,
  type AccountProfile,
  type UserProfileDetails,
} from "@founderhq/core";
import { AppLink as Link } from "@/components/navigation-link";
import {
  accountResourceError,
  useAccountResource,
} from "@/lib/use-account-resource";
import { useAppSession } from "@/lib/app-session-context";
import { PersonAvatar } from "./person-avatar";
import styles from "./account-profile.module.css";

async function profileRequest(
  path = "profile",
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetch(`/api/auth/${path}`, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    cache: "no-store",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw accountResourceError(
      result &&
        typeof result === "object" &&
        "message" in result &&
        typeof result.message === "string"
        ? result.message
        : "This change could not be confirmed. Try again.",
      response.status,
    );
  return result;
}

export function AccountProfileExperience() {
  const session = useAppSession();
  const router = useRouter();
  const cache = useQueryClient();
  const resource = useAccountResource<AccountProfile | null>(
    "profile",
    async (signal) =>
      (await profileRequest("profile", undefined, signal)) as AccountProfile,
    null,
  );
  const [edited, setDraft] = useState<AccountProfile | null>(null);
  const draft = edited ?? resource.value;
  const dirty = edited !== null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState("");
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function change(field: "name" | keyof UserProfileDetails, value: string) {
    setDraft((current) => {
      const base = current ?? resource.value;
      if (!base) return null;
      return field === "name"
        ? { ...base, name: value }
        : { ...base, details: { ...base.details, [field]: value } };
    });
    setMessage("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || saving) return;
    setSaving(true);
    setMessage("");
    setConflict(false);
    try {
      const input = parseProfileUpdate({
        name: draft.name,
        details: draft.details,
        version: draft.version,
      });
      const saved = (await profileRequest("profile", input)) as AccountProfile;
      if (!saved?.id || !saved.version || !saved.details)
        throw new Error(
          "The save confirmation could not be read. Your draft is still available.",
        );
      resource.setValue(saved);
      setDraft(null);
      setMessage("Profile saved.");
      await cache.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "account-resources",
      });
      router.refresh();
    } catch (error) {
      setConflict(
        Boolean(
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 409,
        ),
      );
      setMessage(
        error instanceof Error
          ? error.message
          : "Your profile could not be saved. Your draft is still available.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function changeEmail(event: FormEvent) {
    event.preventDefault();
    if (emailBusy) return;
    setEmailBusy(true);
    setEmailMessage("");
    try {
      await profileRequest("change-email", { newEmail, password });
      setPassword("");
      await resource.refresh();
      setEmailMessage(
        "If the new address is available, a confirmation link will arrive in your current inbox. Confirm it, then verify the new inbox. Your current login email stays active until both steps are complete.",
      );
    } catch (error) {
      setEmailMessage(
        error instanceof Error
          ? error.message
          : "The email change could not be started.",
      );
    } finally {
      setPassword("");
      setEmailBusy(false);
    }
  }
  async function cancelEmail() {
    setEmailBusy(true);
    try {
      await profileRequest("cancel-email-change", {});
      await resource.refresh();
      setEmailMessage(
        "Email change cancelled. Earlier verification links can no longer be used.",
      );
    } catch (error) {
      setEmailMessage(
        error instanceof Error
          ? error.message
          : "Cancellation could not be confirmed.",
      );
    } finally {
      setEmailBusy(false);
    }
  }
  if (session.demo)
    return (
      <main className={styles.main}>
        <h1>Edit profile</h1>
        <p>
          Profile changes require a signed-in account. Demo identities remain
          fictional.
        </p>
      </main>
    );
  const pending = resource.value?.pendingEmail;
  const timezones = Intl.supportedValuesOf("timeZone");
  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>Edit profile</h1>
          <p>
            Your personal details are shared with people who can access your
            workspace.
          </p>
        </div>
        <Link href="/app/account/sessions">Account and security</Link>
      </header>
      {resource.error ? (
        <div className={styles.notice} role="alert">
          <p>
            {resource.error instanceof Error
              ? resource.error.message
              : "Your profile could not be loaded."}
          </p>
          <button type="button" onClick={() => void resource.refresh()}>
            Retry loading
          </button>
        </div>
      ) : null}
      {!draft && !resource.error ? (
        <p role="status">Loading your profile…</p>
      ) : null}
      {draft && resource.value ? (
        <div className={styles.layout}>
          <form className={styles.card} onSubmit={save}>
            <header className={styles.identity}>
              <PersonAvatar
                className={styles.avatar}
                name={draft.name}
                url={draft.details.avatarUrl}
              />
              <div>
                <h2>Personal details</h2>
                <p>
                  Use the name and contact details you want your teammates to
                  see.
                </p>
              </div>
            </header>
            <fieldset disabled={saving} className={styles.fields}>
              <label>
                Full name
                <input
                  required
                  autoComplete="name"
                  maxLength={160}
                  value={draft.name}
                  onChange={(event) => change("name", event.target.value)}
                />
              </label>
              <label>
                Job title
                <input
                  autoComplete="organization-title"
                  maxLength={profileFieldLimits.jobTitle}
                  value={draft.details.jobTitle ?? ""}
                  onChange={(event) => change("jobTitle", event.target.value)}
                />
              </label>
              <label className={styles.wide}>
                About you
                <textarea
                  rows={4}
                  maxLength={profileFieldLimits.bio}
                  value={draft.details.bio ?? ""}
                  onChange={(event) => change("bio", event.target.value)}
                  placeholder="What you work on and how you can help"
                />
              </label>
              <label>
                Phone
                <input
                  type="tel"
                  autoComplete="tel"
                  maxLength={profileFieldLimits.phone}
                  value={draft.details.phone ?? ""}
                  onChange={(event) => change("phone", event.target.value)}
                />
              </label>
              <label>
                Location
                <input
                  maxLength={profileFieldLimits.location}
                  value={draft.details.location ?? ""}
                  onChange={(event) => change("location", event.target.value)}
                  placeholder="City or region"
                />
              </label>
              <label>
                Website
                <input
                  type="url"
                  autoComplete="url"
                  maxLength={profileFieldLimits.website}
                  value={draft.details.website ?? ""}
                  onChange={(event) => change("website", event.target.value)}
                  placeholder="https://"
                />
              </label>
              <label>
                Time zone
                <select
                  aria-label="Time zone"
                  value={draft.details.timezone ?? ""}
                  onChange={(event) => change("timezone", event.target.value)}
                >
                  <option value="">Not specified</option>
                  <option value="UTC">UTC</option>
                  {timezones.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.wide}>
                Photo URL
                <input
                  type="url"
                  maxLength={profileFieldLimits.avatarUrl}
                  aria-label="Photo URL"
                  value={draft.details.avatarUrl ?? ""}
                  onChange={(event) => change("avatarUrl", event.target.value)}
                  placeholder="https://…/photo.jpg"
                />
                <small>
                  Use a public HTTPS image link. Clear it to return to your
                  initials.
                </small>
              </label>
            </fieldset>
            <p className={styles.help}>
              Workspace roles and team memberships are managed through{" "}
              <Link href="/app/portfolio">your workspace</Link> and its Teams
              and access settings.
            </p>
            {message ? (
              <p role={conflict ? "alert" : "status"} className={styles.notice}>
                {message}
              </p>
            ) : null}
            <footer className={styles.actions}>
              {conflict ? (
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const loaded = await resource.refresh();
                    if (loaded.data) {
                      setDraft(null);
                      setConflict(false);
                      setMessage("Latest profile loaded.");
                    }
                  }}
                >
                  Reload latest profile
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!dirty || saving}
                  onClick={() => {
                    setDraft(null);
                    setMessage("");
                  }}
                >
                  Cancel edits
                </button>
              )}
              <button
                className={styles.primary}
                type="submit"
                disabled={!dirty || saving || conflict}
              >
                <Save size={16} />
                {saving ? "Saving…" : "Save profile"}
              </button>
            </footer>
          </form>
          <aside className={styles.side}>
            <section className={styles.card}>
              <h2>
                <LockKeyhole size={18} />
                Login email
              </h2>
              <label>
                Primary login email
                <input value={resource.value.email} readOnly />
              </label>
              <p className={styles.verified}>
                <Check size={15} />
                Verified account email
              </p>
              <p>
                Your email is protected separately from your profile details.
              </p>
              {pending ? (
                <div className={styles.notice} role="status">
                  <strong>
                    {pending.stage === "confirm-current"
                      ? "Confirm in your current inbox"
                      : "Verify your new inbox"}
                  </strong>
                  <p>New address: {pending.email}</p>
                  <p>
                    {pending.stage === "confirm-current"
                      ? "Open the confirmation link sent to your current email. Then verify the new email."
                      : "The current address is confirmed. Open the link sent to your new email to finish."}
                  </p>
                  <small>
                    Expires {new Date(pending.expiresAt).toLocaleString()}
                  </small>
                  <button
                    type="button"
                    disabled={emailBusy}
                    onClick={() => void cancelEmail()}
                  >
                    Cancel email change
                  </button>
                  <button
                    type="button"
                    disabled={emailBusy || resource.loading}
                    onClick={() => void resource.refresh()}
                  >
                    Check verification status
                  </button>
                </div>
              ) : null}
              <details className={styles.emailForm}>
                <summary>
                  {pending ? "Restart email change" : "Change login email"}
                </summary>
                <form onSubmit={changeEmail}>
                  <label>
                    New login email
                    <input
                      required
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={newEmail}
                      disabled={emailBusy}
                      onChange={(event) => setNewEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    Current password
                    <input
                      required
                      type="password"
                      autoComplete="current-password"
                      maxLength={128}
                      value={password}
                      disabled={emailBusy}
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <p>
                    Confirm your password, approve the change in your current
                    inbox, then verify your new inbox.
                  </p>
                  <button
                    className={styles.primary}
                    type="submit"
                    disabled={emailBusy}
                  >
                    {emailBusy ? "Requesting…" : "Send confirmation"}
                  </button>
                  <Link href="/forgot-password">Forgot your password?</Link>
                </form>
              </details>
              {emailMessage ? (
                <p className={styles.notice} role="status">
                  {emailMessage}
                </p>
              ) : null}
            </section>
            <section className={styles.card}>
              <h2>
                <UserRound size={18} />
                Account controls
              </h2>
              <Link href="/app/account/sessions">Sessions and sign-in</Link>
              <Link href="/app/account/privacy">Privacy and your data</Link>
            </section>
          </aside>
        </div>
      ) : null}
    </main>
  );
}
