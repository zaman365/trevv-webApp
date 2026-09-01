"use client";

import {
  Activity,
  Building2,
  CircleAlert,
  CircleCheck,
  History,
  KeyRound,
  MailWarning,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import {
  platformDashboardSchema,
  platformSessionRevocationSchema,
  type PlatformDashboard,
  type PlatformInvitation,
  type PlatformUser,
} from "@founderhq/api-contract";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAppSession } from "@/lib/app-session-context";

type PlatformPanel =
  "overview" | "organizations" | "people" | "invitations" | "audit";

const panels: Array<{
  id: PlatformPanel;
  label: string;
}> = [
  { id: "overview", label: "Overview" },
  { id: "organizations", label: "Organizations" },
  { id: "people", label: "People & access" },
  { id: "invitations", label: "Invitations" },
  { id: "audit", label: "Audit" },
];

export function PlatformAdmin() {
  const session = useAppSession();
  const [dashboard, setDashboard] = useState<PlatformDashboard | null>(null);
  const [panel, setPanel] = useState<PlatformPanel>("overview");
  const [loading, setLoading] = useState(true);
  const [workingUserId, setWorkingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/platform", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(
          platformError(body, "Platform control could not be loaded."),
        );
      const parsed = platformDashboardSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Platform control returned an invalid response.");
      setDashboard(parsed.data);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Platform control could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  const filteredUsers = useMemo(
    () => filterPlatformUsers(dashboard?.users ?? [], query),
    [dashboard?.users, query],
  );
  const filteredInvitations = useMemo(
    () => filterPlatformInvitations(dashboard?.invitations ?? [], query),
    [dashboard?.invitations, query],
  );

  async function revokeOtherSessions(user: PlatformUser) {
    const ownAccount = user.email === session.user.email;
    const confirmed = window.confirm(
      ownAccount
        ? "Revoke your other TREVV sessions? This browser will remain signed in."
        : `Revoke all active sessions for ${user.email}? They will need to sign in again.`,
    );
    if (!confirmed) return;

    setWorkingUserId(user.authUserId);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/platform/users/${encodeURIComponent(user.authUserId)}/revoke-sessions`,
        { method: "POST", credentials: "same-origin" },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(platformError(body, "Sessions could not be revoked."));
      const parsed = platformSessionRevocationSchema.safeParse(body);
      if (!parsed.success)
        throw new Error("Session revocation returned an invalid response.");
      setMessage(
        parsed.data.revokedSessions === 0
          ? "No other active sessions needed revocation."
          : `${parsed.data.revokedSessions} session${parsed.data.revokedSessions === 1 ? "" : "s"} revoked.`,
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sessions could not be revoked.",
      );
    } finally {
      setWorkingUserId(null);
    }
  }

  return (
    <main className="platform-page">
      <header className="platform-header">
        <div>
          <span className="platform-mark" aria-hidden="true">
            <Shield size={22} />
          </span>
          <div>
            <p>Owner-only system administration</p>
            <h1>Platform control</h1>
            <span>
              A private operational view across TREVV. Tenant ownership remains
              separate.
            </span>
          </div>
        </div>
        <div className="platform-header-actions">
          <span className="platform-owner-badge">
            <KeyRound size={13} /> Single platform owner
          </span>
          <button disabled={loading} onClick={() => void load()} type="button">
            <RefreshCw size={14} className={loading ? "spin" : undefined} />
            Refresh
          </button>
        </div>
      </header>

      <section className="platform-boundary" aria-label="Security boundary">
        <ShieldCheck size={18} />
        <div>
          <strong>Protected independently of organization roles</strong>
          <span>
            The server checks the single platform-owner assignment on every
            request. Other signed-in users receive no platform data and no
            discoverable admin page.
          </span>
        </div>
      </section>

      {message ? (
        <p className="platform-message" role="status">
          {message}
        </p>
      ) : null}

      {loading && !dashboard ? (
        <section className="platform-loading" aria-live="polite">
          <RefreshCw className="spin" size={20} /> Loading platform controls…
        </section>
      ) : null}

      {!loading && !dashboard ? (
        <section className="platform-empty">
          <CircleAlert size={24} />
          <h2>Platform control is unavailable</h2>
          <p>
            No privileged data was shown. Refresh to try the secure request
            again.
          </p>
        </section>
      ) : null}

      {dashboard ? (
        <>
          <section className="platform-metrics" aria-label="Platform summary">
            <Metric
              icon={Building2}
              label="Organizations"
              value={dashboard.summary.organizations}
            />
            <Metric
              icon={Users}
              label="Accounts"
              value={dashboard.summary.users}
            />
            <Metric
              icon={Activity}
              label="Active sessions"
              value={dashboard.summary.activeSessions}
            />
            <Metric
              icon={MailWarning}
              label="Delivery failures"
              value={dashboard.summary.failedInvitationDeliveries}
              alert={dashboard.summary.failedInvitationDeliveries > 0}
            />
          </section>

          <div className="platform-console">
            <nav
              className="platform-tabs"
              aria-label="Platform control sections"
            >
              {panels.map((entry) => (
                <button
                  aria-current={panel === entry.id ? "page" : undefined}
                  className={panel === entry.id ? "active" : undefined}
                  key={entry.id}
                  onClick={() => setPanel(entry.id)}
                  type="button"
                >
                  {entry.label}
                </button>
              ))}
            </nav>

            {panel !== "overview" && panel !== "audit" ? (
              <label className="platform-search">
                <Search size={15} />
                <span className="sr-only">Search this section</span>
                <input
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name, email, or organization"
                  type="search"
                  value={query}
                />
              </label>
            ) : null}

            {panel === "overview" ? <Overview dashboard={dashboard} /> : null}
            {panel === "organizations" ? (
              <Organizations dashboard={dashboard} query={query} />
            ) : null}
            {panel === "people" ? (
              <People
                currentEmail={session.user.email}
                onRevoke={revokeOtherSessions}
                users={filteredUsers}
                workingUserId={workingUserId}
              />
            ) : null}
            {panel === "invitations" ? (
              <Invitations invitations={filteredInvitations} />
            ) : null}
            {panel === "audit" ? <Audit dashboard={dashboard} /> : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  alert = false,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <article className={alert ? "alert" : undefined}>
      <span>
        <Icon size={18} />
      </span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
      </div>
    </article>
  );
}

function Overview({ dashboard }: { dashboard: PlatformDashboard }) {
  const outstanding = dashboard.summary.users - dashboard.summary.verifiedUsers;
  return (
    <section className="platform-overview">
      <article>
        <header>
          <Activity size={18} />
          <div>
            <h2>Operational health</h2>
            <p>Identity, access, invitations, and release state.</p>
          </div>
        </header>
        <div className="platform-check-list">
          <CheckRow
            ok={Boolean(dashboard.release)}
            label="Immutable release identity"
            value={
              dashboard.release
                ? shortRelease(dashboard.release.releaseId)
                : "Unavailable"
            }
          />
          <CheckRow
            ok={dashboard.registrationMode === "invite_only"}
            label="Registration policy"
            value={dashboard.registrationMode.replaceAll("_", " ")}
          />
          <CheckRow
            ok={dashboard.summary.failedInvitationDeliveries === 0}
            label="Invitation delivery"
            value={
              dashboard.summary.failedInvitationDeliveries
                ? `${dashboard.summary.failedInvitationDeliveries} failed`
                : "No failures"
            }
          />
          <CheckRow
            ok={outstanding === 0}
            label="Email verification"
            value={
              outstanding
                ? `${outstanding} account${outstanding === 1 ? "" : "s"} pending`
                : "All accounts verified"
            }
          />
        </div>
      </article>
      <article>
        <header>
          <KeyRound size={18} />
          <div>
            <h2>Owner boundary</h2>
            <p>The one account allowed to operate this surface.</p>
          </div>
        </header>
        <dl className="platform-details">
          <div>
            <dt>Platform owner</dt>
            <dd>{dashboard.owner.name}</dd>
          </div>
          <div>
            <dt>Verified address</dt>
            <dd>{dashboard.owner.email}</dd>
          </div>
          <div>
            <dt>Pending invitations</dt>
            <dd>{dashboard.summary.pendingInvitations}</dd>
          </div>
          <div>
            <dt>Snapshot generated</dt>
            <dd>{formatDate(dashboard.generatedAt)}</dd>
          </div>
        </dl>
      </article>
      <article className="platform-guardrails">
        <header>
          <ShieldCheck size={18} />
          <div>
            <h2>Deliberate guardrails</h2>
            <p>Powerful enough to operate safely, intentionally limited.</p>
          </div>
        </header>
        <ul>
          <li>
            No password, token, cookie, or raw mail-provider data is exposed.
          </li>
          <li>No user impersonation or silent entry into another account.</li>
          <li>
            No one-click organization deletion from this cross-tenant surface.
          </li>
          <li>Platform actions are recorded in a dedicated audit trail.</li>
        </ul>
      </article>
    </section>
  );
}

function CheckRow({
  ok,
  label,
  value,
}: {
  ok: boolean;
  label: string;
  value: string;
}) {
  const Icon = ok ? CircleCheck : CircleAlert;
  return (
    <div className={ok ? "ok" : "warning"}>
      <Icon size={16} />
      <span>
        <strong>{label}</strong>
        <small>{value}</small>
      </span>
    </div>
  );
}

function Organizations({
  dashboard,
  query,
}: {
  dashboard: PlatformDashboard;
  query: string;
}) {
  const normalized = query.trim().toLowerCase();
  const organizations = dashboard.organizations.filter((organization) =>
    `${organization.name} ${organization.slug}`
      .toLowerCase()
      .includes(normalized),
  );
  return (
    <section className="platform-section">
      <SectionHeading
        icon={Building2}
        title="Organizations"
        description="Cross-tenant posture without entering or impersonating a member."
      />
      <div className="platform-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Members</th>
              <th>Workspaces</th>
              <th>Pending invites</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {organizations.map((organization) => (
              <tr key={organization.id}>
                <td>
                  <strong>{organization.name}</strong>
                  <small>{organization.slug}</small>
                </td>
                <td>{organization.memberCount}</td>
                <td>{organization.workspaceCount}</td>
                <td>{organization.pendingInvitationCount}</td>
                <td>{formatDate(organization.createdAt, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {organizations.length === 0 ? <EmptyRows /> : null}
    </section>
  );
}

function People({
  currentEmail,
  onRevoke,
  users,
  workingUserId,
}: {
  currentEmail: string;
  onRevoke: (user: PlatformUser) => void;
  users: PlatformUser[];
  workingUserId: string | null;
}) {
  return (
    <section className="platform-section">
      <SectionHeading
        icon={UserRoundCheck}
        title="People & access"
        description="Verification, tenant membership, and active-session oversight."
      />
      <div className="platform-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Verification</th>
              <th>Organization access</th>
              <th>Sessions</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.authUserId}>
                <td>
                  <strong>{user.name}</strong>
                  <small>
                    {user.email}
                    {user.email === currentEmail ? " · you" : ""}
                  </small>
                </td>
                <td>
                  <StatusBadge
                    tone={user.emailVerified ? "success" : "warning"}
                  >
                    {user.emailVerified ? "Verified" : "Pending"}
                  </StatusBadge>
                </td>
                <td>
                  {user.memberships.length ? (
                    <div className="platform-memberships">
                      {user.memberships.map((membership) => (
                        <span
                          key={`${membership.organizationId}:${membership.role}`}
                          className={membership.active ? undefined : "muted"}
                        >
                          {membership.organizationName} ·{" "}
                          {roleLabel(membership.role)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="platform-muted">No mapped membership</span>
                  )}
                </td>
                <td>
                  <strong>{user.activeSessionCount}</strong>
                  {user.lastSessionAt ? (
                    <small>Last {formatDate(user.lastSessionAt)}</small>
                  ) : null}
                </td>
                <td>
                  <button
                    className="platform-row-action"
                    disabled={
                      workingUserId !== null || user.activeSessionCount === 0
                    }
                    onClick={() => onRevoke(user)}
                    type="button"
                  >
                    {workingUserId === user.authUserId
                      ? "Revoking…"
                      : user.email === currentEmail
                        ? "Revoke others"
                        : "Revoke sessions"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users.length === 0 ? <EmptyRows /> : null}
    </section>
  );
}

function Invitations({ invitations }: { invitations: PlatformInvitation[] }) {
  return (
    <section className="platform-section">
      <SectionHeading
        icon={MailWarning}
        title="Invitation delivery"
        description="System-wide status and failure visibility. Manage the active tenant through its scoped controls."
        action={
          <Link href="/app/account/invitations">
            Manage current organization
          </Link>
        }
      />
      <div className="platform-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Invitee</th>
              <th>Organization</th>
              <th>Access</th>
              <th>State</th>
              <th>Delivery</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>
                  <strong>{invitation.email}</strong>
                  <small>
                    Sent {invitation.sendCount} time
                    {invitation.sendCount === 1 ? "" : "s"}
                  </small>
                </td>
                <td>{invitation.organizationName}</td>
                <td>{roleLabel(invitation.role)}</td>
                <td>
                  <StatusBadge
                    tone={
                      invitation.status === "accepted"
                        ? "success"
                        : invitation.status === "pending"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {invitation.status}
                  </StatusBadge>
                </td>
                <td>
                  <StatusBadge
                    tone={
                      invitation.deliveryStatus === "sent"
                        ? "success"
                        : invitation.deliveryStatus === "failed"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {invitation.deliveryStatus}
                  </StatusBadge>
                  {invitation.deliveryErrorCode ? (
                    <small>{invitation.deliveryErrorCode}</small>
                  ) : null}
                </td>
                <td>{formatDate(invitation.expiresAt, false)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {invitations.length === 0 ? (
        <EmptyRows label="No invitations match this view." />
      ) : null}
    </section>
  );
}

function Audit({ dashboard }: { dashboard: PlatformDashboard }) {
  return (
    <section className="platform-section">
      <SectionHeading
        icon={History}
        title="Platform audit trail"
        description="Owner-level changes are separate from tenant activity."
      />
      <div className="platform-audit">
        {dashboard.audit.map((event) => (
          <article key={event.id}>
            <span>
              <History size={15} />
            </span>
            <div>
              <strong>{event.summary}</strong>
              <small>
                {event.actorName} · {event.action.replaceAll("_", " ")}
              </small>
              <small>
                {event.targetType.replaceAll("_", " ")} ·{" "}
                {formatDate(event.createdAt)}
              </small>
            </div>
          </article>
        ))}
      </div>
      {dashboard.audit.length === 0 ? (
        <EmptyRows label="No platform actions have been recorded yet." />
      ) : null}
    </section>
  );
}

function SectionHeading({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Building2;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="platform-section-heading">
      <span>
        <Icon size={18} />
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action ? <div className="platform-section-action">{action}</div> : null}
    </header>
  );
}

function StatusBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return <span className={`platform-status ${tone}`}>{children}</span>;
}

function EmptyRows({
  label = "No results match this view.",
}: {
  label?: string;
}) {
  return <p className="platform-no-results">{label}</p>;
}

export function filterPlatformUsers(
  users: PlatformUser[],
  query: string,
): PlatformUser[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return users;
  return users.filter((user) =>
    `${user.name} ${user.email} ${user.memberships.map((membership) => membership.organizationName).join(" ")}`
      .toLowerCase()
      .includes(normalized),
  );
}

export function filterPlatformInvitations(
  invitations: PlatformInvitation[],
  query: string,
): PlatformInvitation[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return invitations;
  return invitations.filter((invitation) =>
    `${invitation.email} ${invitation.organizationName} ${invitation.status} ${invitation.deliveryStatus}`
      .toLowerCase()
      .includes(normalized),
  );
}

function platformError(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
    ? (value as { error: string }).error
    : fallback;
}

function roleLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function formatDate(value: string, includeTime = true): string {
  return new Intl.DateTimeFormat(
    "en",
    includeTime
      ? { dateStyle: "medium", timeStyle: "short" }
      : { dateStyle: "medium" },
  ).format(new Date(value));
}

function shortRelease(value: string): string {
  return value.length > 24 ? `${value.slice(0, 21)}…` : value;
}
