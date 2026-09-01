"use client";

import { MailPlus, RefreshCw, RotateCw, UserPlus, XCircle } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useOptionalLiveAppData } from "@/lib/live-app-data";

interface InvitationView {
  id: string;
  organizationId: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  deliveryStatus: "pending" | "sent" | "failed";
  version: number;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  lastSentAt?: string;
  workspaceId?: string;
  teamId?: string;
}

export function InvitationManagement() {
  const session = useAppSession();
  const liveData = useOptionalLiveAppData();
  const [invitations, setInvitations] = useState<InvitationView[]>([]);
  const [loading, setLoading] = useState(!session.demo);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const mutationKeys = useRef(new Map<string, string>());
  const dataRevision = useRef(0);

  const load = useCallback(async () => {
    if (session.demo) return;
    const requestedRevision = dataRevision.current;
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/v1/invitations", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(body))
        throw new Error(
          invitationError(body, "Invitations could not be loaded."),
        );
      if (requestedRevision !== dataRevision.current) return;
      setInvitations(body as InvitationView[]);
    } catch (error) {
      if (requestedRevision === dataRevision.current)
        setLoadError(
          error instanceof Error
            ? error.message
            : "Invitations could not be loaded.",
        );
    } finally {
      if (requestedRevision === dataRevision.current) setLoading(false);
    }
  }, [session.demo]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "")
      .trim()
      .toLowerCase();
    const role = String(data.get("role") ?? "member");
    const workspaceId = String(data.get("workspaceId") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setMessage("Enter a valid email address.");
      return;
    }
    dataRevision.current += 1;
    setLoading(false);
    setWorking("create");
    setMessage("");
    const fingerprint = `create:${email}:${role}:${workspaceId}`;
    const idempotencyKey = mutationKey(mutationKeys.current, fingerprint);
    try {
      const response = await fetch("/api/v1/invitations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        credentials: "same-origin",
        body: JSON.stringify({
          email,
          role,
          ...(workspaceId ? { workspaceId } : {}),
        }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok || !isInvitation(body))
        throw new Error(
          invitationError(body, "The invitation could not be sent."),
        );
      setInvitations((current) => [
        body,
        ...current.filter((entry) => entry.id !== body.id),
      ]);
      mutationKeys.current.delete(fingerprint);
      form.reset();
      setMessage(invitationDeliveryMessage(body, "created"));
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The invitation could not be sent.",
      );
    } finally {
      setWorking(null);
    }
  }

  async function transition(
    invitation: InvitationView,
    action: "resend" | "revoke",
  ) {
    dataRevision.current += 1;
    setLoading(false);
    setWorking(invitation.id);
    setMessage("");
    const fingerprint = `${action}:${invitation.id}:${invitation.version}`;
    const idempotencyKey = mutationKey(mutationKeys.current, fingerprint);
    try {
      const response = await fetch(
        action === "resend"
          ? `/api/v1/invitations/${encodeURIComponent(invitation.id)}/resend`
          : `/api/v1/invitations/${encodeURIComponent(invitation.id)}`,
        {
          method: action === "resend" ? "POST" : "DELETE",
          headers: {
            "if-match": `"${invitation.version}"`,
            "idempotency-key": idempotencyKey,
          },
          credentials: "same-origin",
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 409)
        throw new Error(
          "This invitation changed in another browser. Refresh before trying again.",
        );
      if (!response.ok || !isInvitation(body))
        throw new Error(
          invitationError(
            body,
            `The invitation could not be ${action === "resend" ? "resent" : "revoked"}.`,
          ),
        );
      setInvitations((current) =>
        current.map((entry) => (entry.id === body.id ? body : entry)),
      );
      mutationKeys.current.delete(fingerprint);
      setMessage(
        action === "resend"
          ? invitationDeliveryMessage(body, "resent")
          : `Invitation for ${body.email} was revoked.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The invitation could not be updated.",
      );
    } finally {
      setWorking(null);
    }
  }

  return (
    <main className="session-page">
      <header className="session-page-header">
        <div>
          <span className="settings-list-icon">
            <MailPlus size={19} />
          </span>
          <div>
            <p>Organization access</p>
            <h1>Invitations</h1>
            <span>{session.organization.name}</span>
          </div>
        </div>
        <Link href="/app/portfolio">Back to Portfolio</Link>
      </header>

      {session.demo ? (
        <section className="settings-card session-empty-state">
          <h2>No invitations are sent in demo mode</h2>
          <p>
            Start TREVV in live mode to invite verified people into a real
            organization.
          </p>
        </section>
      ) : (
        <>
          <form
            className="settings-card invitation-form"
            onSubmit={createInvitation}
          >
            <div>
              <h2>Invite a person</h2>
              <p>
                The database stores only a hash of the expiring, one-time token
                sent by email. Assign Workspace access now so the person can
                start collaborating immediately after acceptance.
              </p>
            </div>
            <label>
              <span>Email</span>
              <input
                autoComplete="email"
                disabled={working !== null}
                name="email"
                required
                type="email"
              />
            </label>
            <label>
              <span>Organization role</span>
              <select
                defaultValue="member"
                disabled={working !== null}
                name="role"
              >
                <option value="admin">Admin</option>
                <option value="workspace_lead">Workspace lead</option>
                <option value="member">Member</option>
                <option value="guest">Guest</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <label>
              <span>Workspace access</span>
              <select
                defaultValue={liveData?.workspaces[0]?.id ?? ""}
                disabled={working !== null}
                name="workspaceId"
              >
                <option value="">Organization only</option>
                {(liveData?.workspaces ?? []).map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="primary-button"
              disabled={working !== null}
              type="submit"
            >
              <UserPlus size={14} />{" "}
              {working === "create" ? "Sending…" : "Send invitation"}
            </button>
          </form>

          <section className="settings-card">
            <div className="session-management-heading">
              <div>
                <h2>Invitation history</h2>
                <p>
                  Raw tokens, hashes, and provider diagnostics are never shown
                  here.
                </p>
              </div>
              <button
                disabled={loading || working !== null}
                onClick={() => void load()}
                type="button"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
            {loading ? <p role="status">Loading invitations…</p> : null}
            {loadError ? (
              <p className="auth-message" role="status">
                {loadError}
              </p>
            ) : null}
            {!loading && invitations.length === 0 ? (
              <p>No invitations yet.</p>
            ) : null}
            <div className="session-list invitation-list">
              {invitations.map((invitation) => (
                <article key={invitation.id}>
                  <span className="settings-list-icon">
                    <MailPlus size={17} />
                  </span>
                  <div>
                    <strong>{invitation.email}</strong>
                    <span>
                      {roleLabel(invitation.role)} · {invitation.status} ·
                      delivery {invitation.deliveryStatus}
                    </span>
                    <small>
                      Expires {formatInvitationDate(invitation.expiresAt)}
                    </small>
                    {invitation.lastSentAt ? (
                      <small>
                        Last sent {formatInvitationDate(invitation.lastSentAt)}
                      </small>
                    ) : null}
                    <small>
                      {invitation.workspaceId
                        ? `Workspace · ${workspaceName(
                            liveData?.workspaces ?? [],
                            invitation.workspaceId,
                          )}`
                        : "Organization only"}
                    </small>
                  </div>
                  {invitation.status === "pending" ? (
                    <div className="invitation-actions">
                      <button
                        disabled={working !== null}
                        onClick={() => void transition(invitation, "resend")}
                        type="button"
                      >
                        <RotateCw size={13} /> Resend
                      </button>
                      <button
                        disabled={working !== null}
                        onClick={() => void transition(invitation, "revoke")}
                        type="button"
                      >
                        <XCircle size={13} /> Revoke
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            {message ? (
              <p className="auth-message" role="status">
                {message}
              </p>
            ) : null}
          </section>
        </>
      )}
    </main>
  );
}

function workspaceName(
  workspaces: Array<{ id: string; name: string }>,
  workspaceId: string,
) {
  return (
    workspaces.find((workspace) => workspace.id === workspaceId)?.name ??
    "Assigned Workspace"
  );
}

function isInvitation(value: unknown): value is InvitationView {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof (value as { id?: unknown }).id === "string" &&
    typeof (value as { email?: unknown }).email === "string" &&
    typeof (value as { version?: unknown }).version === "number" &&
    ["pending", "sent", "failed"].includes(
      String((value as { deliveryStatus?: unknown }).deliveryStatus),
    ),
  );
}

function mutationKey(keys: Map<string, string>, fingerprint: string): string {
  const existing = keys.get(fingerprint);
  if (existing) return existing;
  const created = crypto.randomUUID();
  keys.set(fingerprint, created);
  return created;
}

function invitationDeliveryMessage(
  invitation: InvitationView,
  action: "created" | "resent",
): string {
  if (invitation.deliveryStatus === "sent")
    return action === "created"
      ? `Invitation sent to ${invitation.email}.`
      : `A new one-time invitation was sent to ${invitation.email}.`;
  if (invitation.deliveryStatus === "pending")
    return `Invitation ${action}; email delivery is still pending.`;
  return `Invitation ${action}, but email delivery failed. You can retry when delivery is available.`;
}

function invitationError(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || !("error" in value))
    return fallback;
  const error = (value as { error?: unknown }).error;
  return error &&
    typeof error === "object" &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : fallback;
}

function roleLabel(role: string) {
  return role === "workspace_lead"
    ? "Workspace lead"
    : `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`;
}

function formatInvitationDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
