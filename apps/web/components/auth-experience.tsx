"use client";

import {
  ArrowRight,
  Check,
  ChevronLeft,
  Grid2X2,
  LogIn,
  MailCheck,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { productCopy } from "@/lib/product-copy";
import { trevvBrand } from "@/lib/branding";
import { clearLiveDraftStorage } from "@/lib/live-workflow-ui";
import { warmLiveApiReadiness } from "@/lib/live-api-readiness";
import type { WebRegistrationMode } from "@/lib/web-runtime-config";
import { CapabilityNotice, TechnicalPreviewBadge } from "./capability-status";

export function AuthExperience({
  demoEnabled,
  mode,
  passwordReset,
  registrationMode,
  returnTo,
  signedOut,
  verified,
}: {
  demoEnabled: boolean;
  mode: "sign-in" | "sign-up";
  passwordReset?: boolean;
  registrationMode: WebRegistrationMode;
  returnTo: string;
  signedOut?: string;
  verified?: boolean;
}) {
  const registrationOpen = registrationMode !== "closed";
  const invitationOnly = registrationMode === "invite_only";
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState(
    verified
      ? "Your email is verified. Sign in to finish setup."
      : passwordReset
        ? "Your password was reset. Sign in with the new password."
        : signedOut === "all"
          ? "All sessions were revoked. Sign in again to continue."
          : signedOut
            ? "You have signed out."
            : "",
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setHydrated(true), 0);
    // Warm a sleeping preview API opportunistically. Authentication requests
    // must still reach the API when this readiness probe times out: the auth
    // request itself is the authoritative operation and can wake the service.
    if (!demoEnabled) void warmLiveApiReadiness();
    return () => window.clearTimeout(timer);
  }, [demoEnabled]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "sign-up" && !registrationOpen) {
      setMessage("Account registration is not currently open.");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const password = String(data.get("password") ?? "");
    const name = String(data.get("name") ?? "").trim();
    const confirmation = String(data.get("passwordConfirmation") ?? "");

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    if (password.length < 12) {
      setMessage("Use at least 12 characters for your password.");
      return;
    }
    if (password.length > 128) {
      setMessage("Use at most 128 characters for your password.");
      return;
    }
    if (mode === "sign-up" && name.length < 2) {
      setMessage("Enter your name using at least 2 characters.");
      return;
    }
    if (mode === "sign-up" && password !== confirmation) {
      setMessage("The password confirmation does not match.");
      return;
    }

    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        mode === "sign-in"
          ? "/api/auth/sign-in/email"
          : "/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(
            mode === "sign-in"
              ? {
                  email,
                  password,
                  rememberMe: data.get("rememberMe") === "on",
                }
              : {
                  name,
                  email,
                  password,
                  callbackURL: new URL(
                    returnTo,
                    window.location.origin,
                  ).toString(),
                },
          ),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (
        mode === "sign-in" &&
        !response.ok &&
        /EMAIL_NOT_VERIFIED/iu.test(authResponseCode(body))
      ) {
        window.location.replace(
          `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      if (
        mode === "sign-up" &&
        !response.ok &&
        authResponseCode(body) === "REGISTRATION_VERIFICATION_DELIVERY_FAILED"
      ) {
        window.location.replace(
          `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(returnTo)}&delivery=failed`,
        );
        return;
      }
      if (!response.ok)
        throw new Error(authErrorMessage(body, response.status));

      if (mode === "sign-up") {
        window.location.replace(
          `/verify-email?email=${encodeURIComponent(email)}&next=${encodeURIComponent(returnTo)}`,
        );
        return;
      }

      if (returnTo.startsWith("/invite/accept?")) {
        window.location.replace(returnTo);
        return;
      }

      const sessionResponse = await fetch("/api/v1/session", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (sessionResponse.ok) {
        window.location.replace(returnTo);
        return;
      }
      const sessionBody: unknown = await sessionResponse
        .json()
        .catch(() => null);
      const sessionCode = apiErrorCode(sessionBody);
      if (
        sessionResponse.status === 404 ||
        (sessionResponse.status === 409 &&
          sessionCode === "onboarding_required")
      ) {
        window.location.replace("/onboarding");
        return;
      }
      if (
        sessionResponse.status === 409 &&
        sessionCode === "invitation_acceptance_required"
      ) {
        window.location.replace("/invite/accept?resume=1");
        return;
      }
      if (
        sessionResponse.status === 409 &&
        sessionCode === "organization_selection_required"
      ) {
        window.location.replace(
          `/select-organization?next=${encodeURIComponent(returnTo)}`,
        );
        return;
      }
      if (
        sessionResponse.status === 403 &&
        sessionCode === "identity_verification_required"
      ) {
        window.location.replace(
          `/verify-email?email=${encodeURIComponent(email)}`,
        );
        return;
      }
      throw new Error(
        apiMessage(
          sessionBody,
          "Your session could not be established. Try again.",
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Authentication is temporarily unavailable. Try again.",
      );
      setPending(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-brand-panel">
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <div className="auth-promise">
          <span>
            <Sparkles size={17} />
          </span>
          <h1>
            {demoEnabled ? "Technical preview." : "Founder work."}
            <br />
            One focused view.
          </h1>
          <p>
            {demoEnabled
              ? "Explore fictional operational work, attention, ownership, and decisions. Changes in this hosted demonstration stay in this browser."
              : "Bring attention, ownership, decisions, and Workspace context into one durable workflow."}
          </p>
          <ul>
            <li>
              <Check size={13} />
              {demoEnabled
                ? "Explainable signals from fictional operational work"
                : "Explainable signals from your operational work"}
            </li>
            <li>
              <Check size={13} />
              Decisions and approvals in context
            </li>
            <li>
              <Check size={13} />
              One calm hierarchy for every Workspace
            </li>
          </ul>
        </div>
      </section>
      <section className="auth-form-panel">
        <div className="auth-form-wrap">
          <TechnicalPreviewBadge mode={demoEnabled ? "demo" : "live"} />
          <h2>
            {demoEnabled
              ? "Explore TREVV"
              : mode === "sign-in"
                ? "Sign in to TREVV"
                : registrationOpen
                  ? invitationOnly
                    ? "Create your invited account"
                    : "Create your account"
                  : "Private beta access"}
          </h2>
          <p>
            {demoEnabled
              ? "Open the explicitly fictional technical preview without entering credentials."
              : mode === "sign-in"
                ? "Use your verified email and password."
                : registrationOpen
                  ? invitationOnly
                    ? "Use the email address named in your valid TREVV invitation. The invitation is checked securely before an account is created."
                    : "Your account stays separate from the fictional product samples."
                  : "TREVV is currently operating as a limited private beta. Self-service account registration is not open yet."}
          </p>
          {!demoEnabled && (mode === "sign-in" || registrationOpen) ? (
            <form
              aria-busy={!hydrated || pending}
              method="post"
              onSubmit={submit}
            >
              {mode === "sign-up" ? (
                <label>
                  <span>Name</span>
                  <input
                    autoComplete="name"
                    disabled={!hydrated || pending}
                    minLength={2}
                    name="name"
                    required
                  />
                </label>
              ) : null}
              <label>
                <span>Email</span>
                <input
                  autoComplete="email"
                  disabled={!hydrated || pending}
                  inputMode="email"
                  name="email"
                  required
                  type="email"
                />
              </label>
              <label>
                <span>Password</span>
                <input
                  autoComplete={
                    mode === "sign-in" ? "current-password" : "new-password"
                  }
                  disabled={!hydrated || pending}
                  maxLength={128}
                  minLength={12}
                  name="password"
                  required
                  type="password"
                />
              </label>
              {mode === "sign-up" ? (
                <label>
                  <span>Confirm password</span>
                  <input
                    autoComplete="new-password"
                    disabled={!hydrated || pending}
                    maxLength={128}
                    minLength={12}
                    name="passwordConfirmation"
                    required
                    type="password"
                  />
                </label>
              ) : (
                <div className="auth-form-options">
                  <label>
                    <input defaultChecked name="rememberMe" type="checkbox" />
                    <span>Keep me signed in</span>
                  </label>
                  <a href="/forgot-password">Forgot password?</a>
                </div>
              )}
              {message ? (
                <p className="auth-message" role="status">
                  {message}
                </p>
              ) : null}
              <button
                className="primary-button"
                disabled={!hydrated || pending}
                type="submit"
              >
                {mode === "sign-in" ? (
                  <LogIn size={16} />
                ) : (
                  <MailCheck size={16} />
                )}
                {pending
                  ? "Please wait…"
                  : mode === "sign-in"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
          ) : null}
          {demoEnabled ? (
            <>
              <div className="auth-separator">
                <span>or</span>
              </div>
              <CapabilityNotice capability="authentication" />
              <a className="demo-auth-button" href="/app/portfolio">
                <Grid2X2 size={16} /> Explore fictional sample workspace
              </a>
            </>
          ) : null}
          <p className="auth-switch">
            {demoEnabled
              ? "Want to preview setup?"
              : mode === "sign-in"
                ? registrationOpen
                  ? invitationOnly
                    ? "Have a TREVV invitation?"
                    : "New to TREVV?"
                  : "Private beta access is limited."
                : "Already have an account?"}{" "}
            <a
              href={
                demoEnabled
                  ? "/onboarding"
                  : `${mode === "sign-in" ? "/sign-up" : "/sign-in"}?next=${encodeURIComponent(returnTo)}`
              }
            >
              {demoEnabled
                ? "View fictional onboarding"
                : mode === "sign-in"
                  ? registrationOpen
                    ? invitationOnly
                      ? "Create invited account"
                      : "Create an account"
                    : "View access status"
                  : "Sign in"}
            </a>
          </p>
        </div>
      </section>
    </main>
  );
}

function authErrorMessage(value: unknown, status: number): string {
  const code = authResponseCode(value);
  const serverMessage =
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof (value as { message?: unknown }).message === "string"
      ? (value as { message: string }).message
      : "";
  if (/EMAIL_NOT_VERIFIED/i.test(code))
    return "Verify your email before signing in.";
  if (
    /INVALID_EMAIL_OR_PASSWORD|INVALID_PASSWORD|USER_NOT_FOUND/i.test(code) ||
    status === 401
  )
    return "Email or password is incorrect.";
  if (/USER_ALREADY_EXISTS/i.test(code))
    return "An account already exists for this email. Sign in or reset the password.";
  if (status === 429) return "Too many attempts. Wait a moment and try again.";
  return (
    serverMessage || "Authentication is temporarily unavailable. Try again."
  );
}

function authResponseCode(value: unknown): string {
  return value && typeof value === "object" && "code" in value
    ? String((value as { code?: unknown }).code ?? "")
    : "";
}

type LiveOnboardingDraft = {
  step: number;
  organizationName: string;
  organizationSlug: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceType: string;
  workspaceColor: string;
  blueprintKey: string;
};

const emptyLiveDraft: LiveOnboardingDraft = {
  step: 1,
  organizationName: "",
  organizationSlug: "",
  workspaceName: "",
  workspaceSlug: "",
  workspaceType: "business",
  workspaceColor: "#5956c9",
  blueprintKey: "operating_business",
};

export function OnboardingExperience({ live }: { live: boolean }) {
  return live ? <LiveOnboardingExperience /> : <DemoOnboardingExperience />;
}

function LiveOnboardingExperience() {
  const [draft, setDraft] = useState(emptyLiveDraft);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [conflicted, setConflicted] = useState(false);
  const [message, setMessage] = useState("");
  const organizationSlugEdited = useRef(false);
  const workspaceSlugEdited = useRef(false);
  const completionKey = useRef(crypto.randomUUID());

  useEffect(() => {
    let active = true;
    void fetch("/api/v1/onboarding", {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(apiMessage(body, "Onboarding could not be loaded."));
        if (!active || !body || typeof body !== "object") return;
        const state = body as {
          status?: unknown;
          step?: unknown;
          draft?: Partial<LiveOnboardingDraft>;
          version?: unknown;
        };
        if (
          typeof state.version !== "number" ||
          !Number.isSafeInteger(state.version) ||
          state.version < 0 ||
          response.headers.get("etag") !== `"${state.version}"`
        ) {
          throw new Error(
            "Onboarding returned an invalid version. Reload and try again.",
          );
        }
        if (state.status === "completed") {
          window.location.replace("/app/portfolio");
          return;
        }
        const savedDraft = state.draft ?? {};
        organizationSlugEdited.current = Boolean(
          savedDraft.organizationSlug &&
          savedDraft.organizationSlug !==
            slugFrom(savedDraft.organizationName ?? ""),
        );
        workspaceSlugEdited.current = Boolean(
          savedDraft.workspaceSlug &&
          savedDraft.workspaceSlug !== slugFrom(savedDraft.workspaceName ?? ""),
        );
        setVersion(state.version);
        setDraft((current) => ({
          ...current,
          ...savedDraft,
          step:
            typeof state.step === "number"
              ? Math.min(4, Math.max(1, state.step))
              : 1,
        }));
      })
      .catch((error: unknown) => {
        if (active)
          setMessage(
            error instanceof Error
              ? error.message
              : "Onboarding could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof LiveOnboardingDraft>(
    key: K,
    value: LiveOnboardingDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveStep(nextStep: number) {
    if (version === null) {
      setMessage("Onboarding is not ready to save. Reload and try again.");
      return;
    }
    const validation = validateLiveOnboarding(
      draft,
      nextStep < draft.step ? nextStep : draft.step,
    );
    if (validation) {
      setMessage(validation);
      return;
    }
    setPending(true);
    setMessage("");
    const next = { ...draft, step: nextStep };
    try {
      const response = await fetch("/api/v1/onboarding", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "if-match": `"${version}"`,
        },
        credentials: "same-origin",
        body: JSON.stringify(compactDraft(next)),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409) {
        setConflicted(true);
        throw new Error(
          "This setup changed in another browser. Reload the saved setup before continuing.",
        );
      }
      if (!response.ok)
        throw new Error(
          apiMessage(body, "Onboarding progress could not be saved."),
        );
      const nextVersion = onboardingVersion(body, response.headers.get("etag"));
      if (nextVersion === null)
        throw new Error(
          "Onboarding returned an invalid version. Reload and try again.",
        );
      setVersion(nextVersion);
      setDraft(next);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Onboarding progress could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  async function complete() {
    const validation = validateLiveOnboarding(draft, 4);
    if (validation) {
      setMessage(validation);
      return;
    }
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/onboarding/complete", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": completionKey.current,
        },
        credentials: "same-origin",
        body: JSON.stringify(compactDraft({ ...draft, step: 5 })),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(apiMessage(body, "TREVV could not finish setup."));
      window.location.replace("/app/portfolio");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "TREVV could not finish setup.",
      );
      setPending(false);
    }
  }

  async function signOut() {
    const response = await fetch("/api/web/sign-out", {
      method: "POST",
      credentials: "same-origin",
    });
    if (!response.ok) {
      setMessage("This browser could not be signed out. Try again.");
      return;
    }
    clearLiveDraftStorage(window.localStorage);
    window.location.replace("/sign-in");
  }

  const blueprintOptions = [
    [
      "operating_business",
      "Operating business",
      "A practical operating board and weekly review cadence",
    ],
    [
      "client_delivery",
      "Client delivery",
      "Delivery stages, approvals, and stakeholder updates",
    ],
    [
      "product_initiative",
      "Product initiative",
      "Discovery, build, launch, and learning structure",
    ],
    [
      "launch_campaign",
      "Launch campaign",
      "Milestones, dependencies, decisions, and launch review",
    ],
    ["blank", "Start blank", "One empty starter board with no preset workflow"],
  ] as const;

  return (
    <main className="onboarding-page">
      <header>
        <button
          className="onboarding-exit"
          onClick={() => void signOut()}
          type="button"
        >
          <ChevronLeft size={16} /> Sign out
        </button>
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <span>Secure setup · Step {draft.step} of 4</span>
      </header>
      <div className="onboarding-track">
        <i style={{ width: `${draft.step * 25}%` }} />
      </div>
      <section aria-busy={loading || pending}>
        <span className="onboarding-icon">
          <Sparkles size={19} />
        </span>
        <h1>
          {draft.step === 1
            ? "Create your organization"
            : draft.step === 2
              ? "Create your first Workspace"
              : draft.step === 3
                ? "Choose a starter Blueprint"
                : "Review your setup"}
        </h1>
        <p>
          {draft.step === 1
            ? "This organization becomes the tenant boundary for your membership and data."
            : draft.step === 2
              ? "Your first Workspace and starter board are created atomically when setup completes."
              : draft.step === 3
                ? "Choose the initial structure. You can change the operating model later."
                : "TREVV will create this tenant once. Retrying safely resumes the same operation."}
        </p>

        {loading ? <p role="status">Loading saved setup…</p> : null}
        {!loading && draft.step === 1 ? (
          <div className="onboarding-form">
            <label>
              Organization name
              <input
                autoComplete="organization"
                disabled={pending}
                maxLength={160}
                onChange={(event) => {
                  const value = event.target.value;
                  update("organizationName", value);
                  if (!organizationSlugEdited.current)
                    update("organizationSlug", slugFrom(value));
                }}
                value={draft.organizationName}
              />
            </label>
            <label>
              Organization URL name
              <input
                disabled={pending}
                maxLength={80}
                onChange={(event) => {
                  organizationSlugEdited.current = true;
                  update("organizationSlug", event.target.value.toLowerCase());
                }}
                placeholder="my-company"
                value={draft.organizationSlug}
              />
            </label>
          </div>
        ) : null}

        {!loading && draft.step === 2 ? (
          <div className="onboarding-form first-workspace-form">
            <label>
              Workspace name
              <input
                disabled={pending}
                maxLength={160}
                onChange={(event) => {
                  const value = event.target.value;
                  update("workspaceName", value);
                  if (!workspaceSlugEdited.current)
                    update("workspaceSlug", slugFrom(value));
                }}
                value={draft.workspaceName}
              />
            </label>
            <div>
              <label>
                Type
                <select
                  disabled={pending}
                  onChange={(event) =>
                    update("workspaceType", event.target.value)
                  }
                  value={draft.workspaceType}
                >
                  <option value="business">Business</option>
                  <option value="brand">Brand</option>
                  <option value="client">Client</option>
                  <option value="product">Product</option>
                  <option value="department">Department</option>
                  <option value="venture">Venture</option>
                  <option value="initiative">Initiative</option>
                  <option value="project">Project</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Color
                <input
                  aria-label="Workspace color"
                  disabled={pending}
                  onChange={(event) =>
                    update("workspaceColor", event.target.value)
                  }
                  type="color"
                  value={draft.workspaceColor}
                />
              </label>
            </div>
            <label>
              Workspace URL name
              <input
                disabled={pending}
                maxLength={80}
                onChange={(event) => {
                  workspaceSlugEdited.current = true;
                  update("workspaceSlug", event.target.value.toLowerCase());
                }}
                placeholder="first-workspace"
                value={draft.workspaceSlug}
              />
            </label>
          </div>
        ) : null}

        {!loading && draft.step === 3 ? (
          <div className="blueprint-choice-grid">
            {blueprintOptions.map(([value, name, description]) => (
              <label key={value}>
                <input
                  checked={draft.blueprintKey === value}
                  disabled={pending}
                  name="blueprint"
                  onChange={() => update("blueprintKey", value)}
                  type="radio"
                />
                <span>
                  <Grid2X2 size={16} />
                </span>
                <strong>{name}</strong>
                <small>{description}</small>
              </label>
            ))}
          </div>
        ) : null}

        {!loading && draft.step === 4 ? (
          <div className="ready-card">
            <span>
              <ShieldCheck size={20} />
            </span>
            <h2>Ready to create your tenant</h2>
            <p>
              Organization <strong>{draft.organizationName}</strong>, Workspace{" "}
              <strong>{draft.workspaceName}</strong>, and its starter board will
              be committed in one database transaction.
            </p>
            <div>
              <b>
                {
                  blueprintOptions.find(
                    ([key]) => key === draft.blueprintKey,
                  )?.[1]
                }
              </b>
              <span>
                Owner membership · private tenant · durable PostgreSQL data
              </span>
            </div>
          </div>
        ) : null}

        {message ? (
          <p className="auth-message" role="status">
            {message}
          </p>
        ) : null}
        {conflicted ? (
          <button
            className="auth-card-link onboarding-reload"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload saved setup
          </button>
        ) : null}
        {!loading ? (
          <footer>
            <button
              disabled={pending || draft.step === 1}
              onClick={() => void saveStep(draft.step - 1)}
              type="button"
            >
              Back
            </button>
            {draft.step < 4 ? (
              <button
                className="primary-button"
                disabled={pending}
                onClick={() => void saveStep(draft.step + 1)}
                type="button"
              >
                {pending ? "Saving…" : "Continue"} <ArrowRight size={14} />
              </button>
            ) : (
              <button
                className="primary-button"
                disabled={pending}
                onClick={() => void complete()}
                type="button"
              >
                {pending ? "Creating…" : "Create organization"}{" "}
                <ArrowRight size={14} />
              </button>
            )}
          </footer>
        ) : null}
      </section>
    </main>
  );
}

function compactDraft(draft: LiveOnboardingDraft) {
  return {
    step: draft.step,
    ...(draft.organizationName.trim()
      ? { organizationName: draft.organizationName.trim() }
      : {}),
    ...(draft.organizationSlug.trim()
      ? { organizationSlug: draft.organizationSlug.trim() }
      : {}),
    ...(draft.workspaceName.trim()
      ? { workspaceName: draft.workspaceName.trim() }
      : {}),
    ...(draft.workspaceSlug.trim()
      ? { workspaceSlug: draft.workspaceSlug.trim() }
      : {}),
    ...(draft.workspaceType ? { workspaceType: draft.workspaceType } : {}),
    ...(draft.workspaceColor ? { workspaceColor: draft.workspaceColor } : {}),
    ...(draft.blueprintKey ? { blueprintKey: draft.blueprintKey } : {}),
  };
}

function onboardingVersion(value: unknown, etag: string | null): number | null {
  if (!value || typeof value !== "object") return null;
  const version = (value as { version?: unknown }).version;
  return typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version >= 0 &&
    etag === `"${version}"`
    ? version
    : null;
}

function validateLiveOnboarding(
  draft: LiveOnboardingDraft,
  throughStep: number,
) {
  if (throughStep >= 1) {
    if (draft.organizationName.trim().length < 2)
      return "Enter an organization name using at least 2 characters.";
    if (!validSlug(draft.organizationSlug))
      return "Use lowercase letters, numbers, and single hyphens for the organization URL name.";
  }
  if (throughStep >= 2) {
    if (draft.workspaceName.trim().length < 2)
      return "Enter a Workspace name using at least 2 characters.";
    if (!validSlug(draft.workspaceSlug))
      return "Use lowercase letters, numbers, and single hyphens for the Workspace URL name.";
  }
  if (throughStep >= 3 && !draft.blueprintKey)
    return "Choose a starter Blueprint.";
  return "";
}

function validSlug(value: string) {
  return (
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) &&
    value.length >= 2 &&
    value.length <= 80
  );
}

function slugFrom(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .replace(/-$/g, "");
}

function apiMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || !("error" in value))
    return fallback;
  const error = (value as { error?: unknown }).error;
  return error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : fallback;
}

function apiErrorCode(value: unknown): string {
  if (!value || typeof value !== "object" || !("error" in value)) return "";
  const error = (value as { error?: unknown }).error;
  return error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";
}

function DemoOnboardingExperience() {
  const copy = productCopy.en.auth;
  const [step, setStep] = useState(1);
  const [managing, setManaging] = useState("businesses");
  const modes = [
    ["businesses", "Multiple businesses / brands", "Operating portfolio"],
    ["clients", "Agency clients", "Client delivery"],
    ["departments", "Company departments", "Department operations"],
    ["products", "Products / initiatives", "Product portfolio"],
    ["personal", "Personal projects", "Personal portfolio"],
    ["blank", "Start blank", "No preset"],
  ] as const;
  return (
    <main className="onboarding-page">
      <header>
        <a href="/sign-in">
          <ChevronLeft size={16} />
          Exit setup
        </a>
        <div className="auth-brand">
          <span className="brand-mark">
            <span>T</span>
          </span>
          <strong>{trevvBrand.name}</strong>
        </div>
        <span>Technical preview · Step {step} of 5</span>
      </header>
      <div className="onboarding-track">
        <i style={{ width: `${step * 20}%` }} />
      </div>
      <section>
        <span className="onboarding-icon">
          <Sparkles size={19} />
        </span>
        <h1>
          {step === 1
            ? "What are you managing?"
            : step === 2
              ? "Create your first Workspace"
              : step === 3
                ? "Choose a starter Blueprint"
                : step === 4
                  ? "Bring your team and context"
                  : "Your Portfolio is ready"}
        </h1>
        <p>
          {step === 1
            ? "This fictional walkthrough selects sample defaults. It does not create an organization or account."
            : step === 2
              ? "A Workspace is anything you are responsible for — a business, client, product, department, or initiative."
              : step === 3
                ? "Start with a useful structure or keep the Workspace completely blank."
                : step === 4
                  ? "Preview invitations, connections, and import mapping. No external or durable action occurs."
                  : "Open the fictional Portfolio to explore health, priority, waiting work, and next attention."}
        </p>
        <CapabilityNotice capability="browserChanges" />
        {step === 1 && (
          <div className="onboarding-form onboarding-mode-form">
            <label>
              {copy.organization}
              <input defaultValue="TREVV Demo" />
            </label>
            <div className="managing-grid">
              {modes.map(([value, title, template]) => (
                <label
                  className={managing === value ? "selected" : ""}
                  key={value}
                >
                  <input
                    type="radio"
                    name="managing"
                    value={value}
                    checked={managing === value}
                    onChange={() => setManaging(value)}
                  />
                  <span>{title.at(0)}</span>
                  <strong>{title}</strong>
                  <small>{template}</small>
                </label>
              ))}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="onboarding-form first-workspace-form">
            <label>
              Workspace name
              <input
                defaultValue={
                  managing === "clients" ? "First client" : "Northstar Apparel"
                }
              />
            </label>
            <div>
              <label>
                Type
                <select
                  defaultValue={managing === "clients" ? "client" : "business"}
                >
                  <option value="business">Business</option>
                  <option value="brand">Brand</option>
                  <option value="client">Client</option>
                  <option value="product">Product</option>
                  <option value="department">Department</option>
                  <option value="venture">Venture</option>
                  <option value="initiative">Initiative</option>
                  <option value="project">Project</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label>
                Owner
                <select>
                  <option>Mohammed Zaman</option>
                  <option>Assign later</option>
                </select>
              </label>
            </div>
            <div>
              <label>
                Icon / color
                <div className="workspace-identity-input">
                  <span>N</span>
                  <input
                    type="color"
                    defaultValue="#5956c9"
                    aria-label="Workspace color"
                  />
                </div>
              </label>
              <label>
                Health <small>Optional</small>
                <select defaultValue="on_track">
                  <option value="on_track">On Track</option>
                  <option value="watch">Attention</option>
                  <option value="critical">Critical</option>
                  <option value="parked">Paused</option>
                </select>
              </label>
            </div>
            <label>
              Current priority <small>Optional</small>
              <input
                placeholder="What matters most right now?"
                defaultValue="Prepare the first launch review"
              />
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="blueprint-choice-grid">
            {[
              "Operating business",
              "Client delivery",
              "Product initiative",
              "Launch campaign",
              "Start blank",
            ].map((name, index) => (
              <label key={name}>
                <input
                  type="radio"
                  name="blueprint"
                  defaultChecked={index === 0}
                />
                <span>
                  <Grid2X2 size={16} />
                </span>
                <strong>{name}</strong>
                <small>
                  {index === 4
                    ? "No statuses or fields added"
                    : "Board, views, update cadence, and optional review ritual"}
                </small>
              </label>
            ))}
          </div>
        )}
        {step === 4 && (
          <div className="setup-option-grid">
            <label>
              <input type="checkbox" />
              <span>
                <UserRound size={17} />
              </span>
              <strong>Preview team invitation</strong>
              <small>No email is sent</small>
            </label>
            <label>
              <input type="checkbox" />
              <span>G</span>
              <strong>Preview Google Drive setup</strong>
              <small>No provider account is connected</small>
            </label>
            <label>
              <input type="checkbox" />
              <span>
                <Grid2X2 size={17} />
              </span>
              <strong>Preview spreadsheet mapping</strong>
              <small>No file is uploaded or imported</small>
            </label>
            <label>
              <input type="checkbox" defaultChecked />
              <span>
                <ShieldCheck size={17} />
              </span>
              <strong>Preview private-workspace setting</strong>
              <small>Not an active permission control</small>
            </label>
          </div>
        )}
        {step === 5 && (
          <div className="ready-card">
            <span>
              <Check size={20} />
            </span>
            <h2>Your sample Portfolio preview is ready</h2>
            <p>
              TREVV prepared a browser-local walkthrough of one Portfolio, a
              Workspace, a starter Blueprint, and a calm Portfolio view. No
              account, organization, or shared record was created.
            </p>
            <div>
              <b>Venture Portfolio</b>
              <span>1 Workspace · 1 owner · private</span>
            </div>
          </div>
        )}
        <footer>
          <button
            disabled={step === 1}
            onClick={() => setStep((current) => current - 1)}
          >
            {copy.back}
          </button>
          {step < 5 ? (
            <button
              className="primary-button"
              onClick={() => setStep((current) => current + 1)}
            >
              {copy.continue}
              <ArrowRight size={14} />
            </button>
          ) : (
            <a className="primary-button" href="/app/portfolio">
              Open fictional sample
              <ArrowRight size={14} />
            </a>
          )}
        </footer>
      </section>
    </main>
  );
}
