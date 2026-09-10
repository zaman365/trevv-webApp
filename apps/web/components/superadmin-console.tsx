"use client";

import {
  Activity,
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Mail,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  superadminDirectorySchema,
  superadminDirectoryFilters,
  superadminOverviewSchema,
  type SuperadminDirectoryKind,
  type SuperadminDirectoryResult,
  type SuperadminOverview,
  type SuperadminSession,
} from "@founderhq/api-contract";
import { superadminRequest } from "@/lib/superadmin-client";
import styles from "./superadmin.module.css";

type Row = SuperadminDirectoryResult["items"][number];
type DialogAction = {
  kind:
    | "organization"
    | "administrator"
    | "reveal"
    | "revoke-sessions"
    | "resend"
    | "revoke"
    | "access"
    | "revoke-admin-invitation";
  row?: Row;
};
const titles = {
  overview: "Platform overview",
  organizations: "Organisations",
  people: "People on TREVV",
  invitations: "Organisation invitations",
  administrators: "Administrators",
  audit: "Audit trail",
};
const subtitles = {
  overview: "A focused view of your organisations, accounts and access.",
  organizations: "Create organisations and invite their first owner.",
  people:
    "Account and access information, with contact details protected by default.",
  invitations:
    "Track delivery, send a fresh invitation, or withdraw pending access.",
  administrators: "Choose who can operate the platform and what they can do.",
  audit: "Administrative access and actions, retained for 180 days.",
};
export function SuperadminConsole({
  session,
  section,
  initialFilter = "all",
  initialQuery = "",
  organizationId,
}: {
  session: SuperadminSession;
  section: "overview" | SuperadminDirectoryKind;
  initialFilter?: string;
  initialQuery?: string;
  organizationId?: string | undefined;
}) {
  const [overview, setOverview] = useState<SuperadminOverview | null>(null);
  const [directory, setDirectory] = useState<SuperadminDirectoryResult | null>(
    null,
  );
  const [pendingAdmins, setPendingAdmins] = useState<Row[]>([]);
  const [page, setPage] = useState(0),
    [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const [createdOrganization, setCreatedOrganization] = useState<string | null>(
    null,
  );
  const [revision, setRevision] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<DialogAction | null>(null);
  const [revealed, setRevealed] = useState<{
    name: string;
    email: string;
  } | null>(null);
  const [working, setWorking] = useState(false),
    [dialogError, setDialogError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const canOperate = session.role !== "auditor";
  const directoryKind = section === "overview" ? "organizations" : section;
  const loadKey = JSON.stringify([
    section,
    page,
    query,
    filter,
    organizationId,
    revision,
  ]);
  const loading = loadedKey !== loadKey;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    void (async () => {
      try {
        const values = await Promise.all([
          superadminRequest(
            `/directory/${directoryKind}?page=${page}&q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}${organizationId ? `&organizationId=${encodeURIComponent(organizationId)}` : ""}`,
            undefined,
            "GET",
            controller.signal,
          ),
          section === "overview"
            ? superadminRequest(
                "/overview",
                undefined,
                "GET",
                controller.signal,
              )
            : null,
          section === "administrators"
            ? superadminRequest<{ items: Row[] }>(
                "/administrator-invitations",
                undefined,
                "GET",
                controller.signal,
              )
            : null,
        ]);
        if (!alive) return;
        setDirectory(superadminDirectorySchema.parse(values[0]));
        if (values[1]) setOverview(superadminOverviewSchema.parse(values[1]));
        if (values[2]) setPendingAdmins(values[2].items);
      } catch (error) {
        if (alive) {
          setDirectory(null);
          setOverview(null);
          setMessage(
            error instanceof Error
              ? error.message
              : "Platform data could not be loaded.",
          );
        }
      } finally {
        if (alive) setLoadedKey(loadKey);
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [
    directoryKind,
    section,
    page,
    query,
    filter,
    organizationId,
    revision,
    loadKey,
  ]);
  useEffect(() => {
    if (action) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 60_000);
    return () => clearTimeout(timer);
  }, [revealed]);

  function open(value: DialogAction) {
    setRevealed(null);
    setDialogError("");
    setAction(value);
  }
  function refresh() {
    setMessage("");
    setRevision((value) => value + 1);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget),
      reason = String(form.get("reason"));
    setWorking(true);
    setDialogError("");
    const id = encodeURIComponent(String(action.row?.id ?? ""));
    try {
      if (
        action.kind === "organization" &&
        String(form.get("contactPhone") ?? "").trim() &&
        !String(form.get("contactName") ?? "").trim()
      )
        throw new Error(
          "Enter the contact person’s name to save their phone number.",
        );
      let result: Record<string, unknown> = {};
      if (action.kind === "organization")
        result = await superadminRequest("/organizations", {
          name: form.get("name"),
          slug: form.get("slug"),
          ownerEmail: form.get("email"),
          ...(String(form.get("contactName") ?? "").trim()
            ? {
                contact: {
                  kind: "primary",
                  name: form.get("contactName"),
                  email: form.get("email"),
                  phone: String(form.get("contactPhone") ?? "").trim(),
                  jobTitle: "",
                },
              }
            : {}),
          reason,
        });
      if (action.kind === "administrator")
        result = await superadminRequest("/administrator-invitations", {
          email: form.get("email"),
          role: form.get("role"),
          reason,
        });
      if (action.kind === "reveal") {
        const person = await superadminRequest<{ name: string; email: string }>(
          `/people/${id}/reveal`,
          { reason },
        );
        setRevealed(person);
        return;
      }
      if (action.kind === "revoke-sessions")
        result = await superadminRequest(`/people/${id}/revoke-sessions`, {
          reason,
        });
      if (action.kind === "resend" || action.kind === "revoke")
        result = await superadminRequest(`/invitations/${id}/${action.kind}`, {
          reason,
        });
      if (action.kind === "revoke-admin-invitation")
        result = await superadminRequest(
          `/administrator-invitations/${id}/revoke`,
          { reason },
        );
      if (action.kind === "access")
        result = await superadminRequest(
          `/administrators/${id}`,
          {
            role: form.get("role"),
            disabled: form.get("access") === "disabled",
            reason,
          },
          "PATCH",
        );
      if (action.kind === "organization")
        setCreatedOrganization(String(result.id));
      setAction(null);
      setMessage(
        result.deliveryStatus === "failed"
          ? "Saved, but the invitation email could not be delivered. Use the invitation controls to try again."
          : action.kind === "organization"
            ? "Organisation created and its owner invited."
            : action.kind === "administrator"
              ? "Administrator invitation sent."
              : "Change saved and recorded in the audit trail.",
      );
      setRevision((value) => value + 1);
    } catch (error) {
      setDialogError(
        error instanceof Error
          ? error.message
          : "The action could not be completed.",
      );
    } finally {
      setWorking(false);
    }
  }
  const actionTitle = action
    ? {
        organization: "Create an organisation",
        administrator: "Invite an administrator",
        reveal: "View protected contact details",
        "revoke-sessions": "Revoke account sessions",
        resend: "Send a fresh invitation",
        revoke: "Withdraw invitation",
        access: "Change administrator access",
        "revoke-admin-invitation": "Withdraw administrator invitation",
      }[action.kind]
    : "";
  return (
    <main>
      <header className={styles.heading}>
        <div>
          <h1>{titles[section]}</h1>
          <p>{subtitles[section]}</p>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {canOperate &&
            (section === "organizations" || section === "overview") && (
              <button
                className={styles.primary}
                onClick={() => open({ kind: "organization" })}
              >
                <Plus size={17} />
                Create organisation
              </button>
            )}
          {session.role === "owner" && section === "administrators" && (
            <button
              className={styles.primary}
              onClick={() => open({ kind: "administrator" })}
            >
              <Plus size={17} />
              Invite administrator
            </button>
          )}
        </div>
      </header>
      {message && (
        <p className={styles.notice} role="status">
          {message}{" "}
          {createdOrganization && (
            <Link
              href={`/superadmin/organizations/${encodeURIComponent(createdOrganization)}`}
              prefetch={false}
            >
              Complete organisation profile ·{" "}
            </Link>
          )}
          <Link href="/superadmin/security" prefetch={false}>
            Security settings
          </Link>
        </p>
      )}
      {section === "overview" && overview && (
        <>
          <section className={styles.metrics} aria-label="Platform totals">
            {[
              {
                title: "Organisations",
                value: overview.organizations,
                detail: `${overview.newOrganizations} joined in the last 30 days`,
                icon: Building2,
              },
              {
                title: "Accounts",
                value: overview.users,
                detail: `${overview.verifiedUsers} email verified`,
                icon: Users,
              },
              {
                title: "Active sessions",
                value: overview.activeSessions,
                detail: "Unexpired sign-ins",
                icon: Activity,
              },
              {
                title: "Pending invitations",
                value: overview.pendingInvitations,
                detail: `${overview.failedDeliveries} delivery failures`,
                icon: Mail,
              },
            ].map((metric) => (
              <article className={styles.metric} key={metric.title}>
                <div>
                  <p>{metric.title}</p>
                  <metric.icon size={19} />
                </div>
                <strong>{metric.value.toLocaleString("en")}</strong>
                <span>{metric.detail}</span>
              </article>
            ))}
          </section>
          <section
            className={`${styles.panel} ${styles.attention}`}
            aria-label="Platform follow-up"
          >
            <header className={styles.panelHeader}>
              <div>
                <h2>Needs attention</h2>
                <p>Follow up on contact details, ownership and access.</p>
              </div>
            </header>
            <ul className={styles.attentionList}>
              {[
                {
                  count: overview.missingContacts,
                  text: "Organisations missing a primary contact",
                  href: "/superadmin/organizations?filter=missing_contact",
                },
                {
                  count: overview.missingOwners,
                  text: "Organisations awaiting an owner",
                  href: "/superadmin/organizations?filter=missing_owner",
                },
                {
                  count: overview.reviewsDue,
                  text: "Organisation reviews due",
                  href: "/superadmin/organizations?filter=review_due",
                },
                {
                  count: overview.failedDeliveries,
                  text: "Pending invitations with delivery failures",
                  href: "/superadmin/invitations?filter=delivery_failed",
                },
                {
                  count: overview.users - overview.verifiedUsers,
                  text: "Accounts awaiting email verification",
                  href: "/superadmin/people?filter=unverified",
                },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} prefetch={false}>
                    <strong>{item.count}</strong>
                    {item.text}
                    <ArrowRight size={16} />
                  </Link>
                </li>
              ))}
              {session.role === "owner" && (
                <li>
                  <Link
                    href="/superadmin/administrators?filter=setup_pending"
                    prefetch={false}
                  >
                    Review administrator security setup <ArrowRight size={16} />
                  </Link>
                </li>
              )}
            </ul>
          </section>
          <div className={styles.twoColumns}>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Access at a glance</h2>
                <ShieldCheck size={19} />
              </header>
              <div className={styles.panelBody}>
                <div className={styles.statLine}>
                  <span>Verified account emails</span>
                  <strong>
                    {overview.verifiedUsers} / {overview.users}
                  </strong>
                </div>
                <div
                  className={styles.progress}
                  role="img"
                  aria-label={`${overview.verifiedUsers} of ${overview.users} accounts have verified email`}
                >
                  <span
                    style={{
                      width: `${overview.users ? Math.min(100, (100 * overview.verifiedUsers) / overview.users) : 0}%`,
                    }}
                  />
                </div>
                <p className={styles.muted}>
                  Session counts show valid sign-ins. They do not indicate who
                  is currently online.
                </p>
                <Link
                  className={styles.textButton}
                  href="/superadmin/people"
                  prefetch={false}
                >
                  Review accounts <ArrowRight size={15} />
                </Link>
              </div>
            </section>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Privacy boundaries</h2>
                <Eye size={19} />
              </header>
              <div className={styles.panelBody}>
                <div className={styles.policy}>
                  <h3>Operational information only</h3>
                  <p>Customer content stays in its organisation.</p>
                </div>
                <div className={styles.policy}>
                  <h3>Purpose before access</h3>
                  <p>
                    Contact details require a reason. Administrative actions are
                    recorded.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
      <section className={styles.panel} aria-busy={loading}>
        <header className={styles.panelHeader}>
          <div>
            <h2>
              {section === "overview"
                ? "Recent organisations"
                : titles[section]}
            </h2>
            <p>
              {directory
                ? `${directory.total.toLocaleString("en")} records`
                : loading
                  ? "Loading records…"
                  : "No records loaded"}
            </p>
          </div>
          {section === "overview" && (
            <Link
              className={styles.textButton}
              href="/superadmin/organizations"
              prefetch={false}
            >
              View all <ArrowRight size={15} />
            </Link>
          )}
        </header>
        {organizationId && (
          <div className={styles.scopeBanner}>
            <span>
              Showing records for one organisation ·{" "}
              <Link
                href={`/superadmin/organizations/${encodeURIComponent(organizationId)}`}
                prefetch={false}
              >
                View profile
              </Link>
            </span>
            <Link href={`/superadmin/${directoryKind}`} prefetch={false}>
              Clear organisation filter
            </Link>
          </div>
        )}
        {section !== "overview" && (
          <form
            className={styles.search}
            onSubmit={(event) => {
              event.preventDefault();
              setPage(0);
              setQuery(String(new FormData(event.currentTarget).get("q")));
            }}
          >
            <Search size={18} />
            <input
              aria-label={
                section === "people" ? "Search by account ID" : "Search records"
              }
              name="q"
              defaultValue={initialQuery}
              type="search"
              maxLength={100}
              placeholder={
                section === "people"
                  ? "Find an account by ID…"
                  : section === "audit"
                    ? "Search action or target ID…"
                    : "Search records…"
              }
            />
            <select
              aria-label="Filter records"
              value={filter}
              onChange={(event) => {
                setPage(0);
                setFilter(event.target.value);
              }}
            >
              {superadminDirectoryFilters[directoryKind].map((value) => (
                <option key={value} value={value}>
                  {filterLabel(value)}
                </option>
              ))}
            </select>
            <button className={styles.secondary}>Search</button>
            {(filter !== "all" || query) && (
              <button
                type="button"
                className={styles.textButton}
                onClick={(event) => {
                  setPage(0);
                  setFilter("all");
                  setQuery("");
                  const input =
                    event.currentTarget.form?.elements.namedItem("q");
                  if (input instanceof HTMLInputElement) input.value = "";
                }}
              >
                Reset search
              </button>
            )}
          </form>
        )}
        {!directory ? (
          <div className={styles.empty}>
            <ShieldCheck size={28} />
            <h3>
              {loading
                ? "Loading your secure view…"
                : "This view could not be loaded"}
            </h3>
            <p>
              {loading
                ? "Checking access and retrieving operational records."
                : "No privileged data is shown. Refresh to try again."}
            </p>
          </div>
        ) : directory.items.length === 0 ? (
          <div className={styles.empty}>
            <Building2 size={28} />
            <h3>
              {query || filter !== "all"
                ? "No matching records"
                : "No records yet"}
            </h3>
            <p>
              {section === "organizations" || section === "overview"
                ? "Create an organisation and invite its owner to bring them onto TREVV."
                : "Records will appear here as people join and administrators take action."}
            </p>
          </div>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>
                    {directoryKind === "audit"
                      ? "Action"
                      : directoryKind === "people"
                        ? "Account"
                        : directoryKind === "invitations"
                          ? "Organisation / recipient"
                          : "Name"}
                  </th>
                  {directoryKind === "organizations" && (
                    <th>Primary contact</th>
                  )}
                  <th>
                    {directoryKind === "organizations"
                      ? "Members / workspaces"
                      : directoryKind === "people"
                        ? "Verification"
                        : directoryKind === "audit"
                          ? "Actor / target"
                          : "Access"}
                  </th>
                  <th>
                    {directoryKind === "audit"
                      ? "Reason"
                      : directoryKind === "people"
                        ? "Sessions / organisations"
                        : "Status"}
                  </th>
                  <th>Created</th>
                  {canOperate &&
                    directoryKind !== "audit" &&
                    directoryKind !== "organizations" && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {directory.items
                  .slice(0, section === "overview" ? 5 : 25)
                  .map((row) => (
                    <tr key={String(row.id)}>
                      <td>
                        {directoryKind === "organizations" ||
                        directoryKind === "invitations" ? (
                          <Link
                            className={styles.recordLink}
                            href={`/superadmin/organizations/${encodeURIComponent(String(directoryKind === "organizations" ? row.id : row.organizationId))}`}
                            prefetch={false}
                          >
                            {String(row.name)}
                          </Link>
                        ) : (
                          <strong>
                            {directoryKind === "audit"
                              ? String(row.name)
                                  .replaceAll(".", " · ")
                                  .replaceAll("_", " ")
                              : String(row.name)}
                          </strong>
                        )}
                        {directoryKind === "organizations" && (
                          <small>
                            {[row.city, row.country]
                              .filter(Boolean)
                              .join(", ") || "Location not provided"}
                          </small>
                        )}
                        <small>
                          {String(
                            row.email ??
                              row.slug ??
                              (directoryKind === "audit" ? "" : row.id),
                          )}
                        </small>
                      </td>
                      {directoryKind === "organizations" && (
                        <td>
                          <strong>{String(row.contactName)}</strong>
                          <small>
                            {row.contactEmail
                              ? String(row.contactEmail)
                              : "Add a contact in the profile"}
                          </small>
                        </td>
                      )}
                      <td>
                        {directoryKind === "organizations" ? (
                          <>
                            {row.memberCount} members · {row.workspaceCount}{" "}
                            workspaces<small>{row.ownerCount} owners</small>
                          </>
                        ) : directoryKind === "people" ? (
                          <>
                            <span
                              className={`${styles.badge} ${row.emailVerified ? styles.good : styles.warn}`}
                            >
                              {row.emailVerified ? "Verified" : "Unverified"}
                            </span>
                            {row.membershipRole && (
                              <small>
                                Organisation role: {String(row.membershipRole)}
                              </small>
                            )}
                          </>
                        ) : directoryKind === "audit" ? (
                          <>
                            {String(row.actor)}
                            <small>
                              {String(row.targetType)} ·{" "}
                              {row.targetType === "organization" ? (
                                <Link
                                  href={`/superadmin/organizations/${encodeURIComponent(String(row.targetId))}`}
                                  prefetch={false}
                                >
                                  {String(row.targetId)}
                                </Link>
                              ) : (
                                String(row.targetId)
                              )}
                            </small>
                          </>
                        ) : (
                          <span className={styles.badge}>
                            {String(row.role)}
                          </span>
                        )}
                      </td>
                      <td>
                        {directoryKind === "people" ? (
                          <>
                            {row.sessionCount} sessions ·{" "}
                            {row.organizationCount} organisations
                            <small>
                              Latest retained sign-in:{" "}
                              {row.lastSignInAt
                                ? date(row.lastSignInAt)
                                : "None"}
                            </small>
                          </>
                        ) : directoryKind === "audit" ? (
                          String(row.reason)
                        ) : directoryKind === "organizations" ? (
                          <>
                            <span
                              className={`${styles.badge} ${Number(row.ownerCount) ? styles.good : styles.warn}`}
                            >
                              {Number(row.ownerCount)
                                ? "Active"
                                : "Awaiting owner"}
                            </span>
                            <small>
                              {filterLabel(String(row.stage))} ·{" "}
                              {String(row.priority)} priority
                            </small>
                            <small>
                              {row.nextReviewAt
                                ? `Review ${date(row.nextReviewAt)}${row.reviewDue ? " · Due" : ""}`
                                : "Review not scheduled"}
                            </small>
                          </>
                        ) : directoryKind === "invitations" ? (
                          <>
                            <span
                              className={`${styles.badge} ${row.deliveryStatus === "failed" ? styles.warn : ""}`}
                            >
                              {String(row.status)}
                            </span>
                            <small>
                              Email {String(row.deliveryStatus)} ·{" "}
                              {row.sendCount} attempts
                            </small>
                            <small>Expires {date(row.expiresAt)}</small>
                            <small>
                              Last sent{" "}
                              {row.lastSentAt ? date(row.lastSentAt) : "—"}
                            </small>
                          </>
                        ) : (
                          <>
                            <span
                              className={`${styles.badge} ${row.disabled ? styles.warn : styles.good}`}
                            >
                              {row.disabled ? "Access revoked" : "Active"}
                            </span>
                            <small>
                              {row.twoFactorEnabled
                                ? "Authenticator enrolled"
                                : "Setup pending"}
                            </small>
                            <small>
                              {row.passkeyCount} passkeys · {row.sessionCount}{" "}
                              sessions
                            </small>
                            <small>
                              Latest retained sign-in:{" "}
                              {row.lastSignInAt
                                ? date(row.lastSignInAt)
                                : "None"}
                            </small>
                          </>
                        )}
                      </td>
                      <td>{date(row.createdAt, directoryKind === "audit")}</td>
                      {canOperate &&
                        directoryKind !== "audit" &&
                        directoryKind !== "organizations" && (
                          <td>
                            <div className={styles.tableActions}>
                              {directoryKind === "people" && (
                                <>
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      open({ kind: "reveal", row })
                                    }
                                  >
                                    View contact
                                  </button>
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      open({ kind: "revoke-sessions", row })
                                    }
                                    disabled={!row.sessionCount}
                                  >
                                    Revoke sessions
                                  </button>
                                </>
                              )}
                              {directoryKind === "invitations" &&
                                (row.status === "pending" ||
                                  row.status === "expired") && (
                                  <>
                                    <button
                                      className={styles.textButton}
                                      onClick={() =>
                                        open({ kind: "resend", row })
                                      }
                                    >
                                      Resend
                                    </button>
                                    <button
                                      className={styles.textButton}
                                      onClick={() =>
                                        open({ kind: "revoke", row })
                                      }
                                    >
                                      Withdraw
                                    </button>
                                  </>
                                )}
                              {directoryKind === "administrators" &&
                                session.role === "owner" &&
                                row.id !== session.id && (
                                  <button
                                    className={styles.textButton}
                                    onClick={() =>
                                      open({ kind: "access", row })
                                    }
                                  >
                                    Manage access
                                  </button>
                                )}
                              {row.id === session.id && (
                                <span className={styles.muted}>You</span>
                              )}
                            </div>
                          </td>
                        )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        {section !== "overview" && directory && (
          <footer className={styles.pagination}>
            <span>
              Page {page + 1} of{" "}
              {Math.max(1, Math.ceil(directory.total / directory.pageSize))}
            </span>
            <div className={styles.actions}>
              <button
                aria-label="Previous page"
                className={styles.secondary}
                disabled={page === 0 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                <ChevronLeft size={16} />
                Previous
              </button>
              <button
                aria-label="Next page"
                className={styles.secondary}
                disabled={
                  (page + 1) * directory.pageSize >= directory.total || loading
                }
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        )}
      </section>
      {section === "administrators" && pendingAdmins.length > 0 && (
        <section className={styles.panel} style={{ marginTop: "1.5rem" }}>
          <header className={styles.panelHeader}>
            <h2>Pending administrator invitations</h2>
          </header>
          <div className={styles.panelBody}>
            <ul className={styles.securityList}>
              {pendingAdmins.map((row) => (
                <li key={String(row.id)}>
                  <span>
                    {String(row.email)}
                    <small>
                      {String(row.role)} · Email {String(row.deliveryStatus)} ·
                      Expires {date(row.expiresAt)}
                    </small>
                  </span>
                  <button
                    className={styles.textButton}
                    onClick={() =>
                      open({ kind: "revoke-admin-invitation", row })
                    }
                  >
                    Withdraw
                  </button>
                </li>
              ))}
            </ul>
            <p className={styles.muted}>
              To resend, invite the same address again. Its previous link will
              be invalidated.
            </p>
          </div>
        </section>
      )}
      <p className={styles.privacyFoot}>
        <ShieldCheck size={16} />
        {section === "audit"
          ? "Audit reasons should contain operational context only. Do not include customer content, passwords or sensitive personal details."
          : "Customer messages, tasks, files and session locations are excluded from this view."}
      </p>
      <dialog
        className={`${styles.root} ${styles.modal}`}
        ref={dialog}
        onCancel={() => {
          setAction(null);
          setRevealed(null);
        }}
        onClose={() => {
          setAction(null);
          setRevealed(null);
        }}
        aria-labelledby="admin-dialog-title"
      >
        <header className={styles.panelHeader}>
          <h2 id="admin-dialog-title">{actionTitle}</h2>
          <button
            className={styles.textButton}
            aria-label="Close dialog"
            onClick={() => {
              setAction(null);
              setRevealed(null);
            }}
            disabled={working}
          >
            <X size={20} />
          </button>
        </header>
        {dialogError && (
          <p className={styles.notice} role="alert">
            {dialogError}{" "}
            <Link href="/superadmin/security">Verify in security settings</Link>
          </p>
        )}
        {revealed ? (
          <div className={styles.panelBody}>
            <h3>{revealed.name}</h3>
            <p>{revealed.email}</p>
            <p className={styles.privacyFoot}>
              This access was recorded. Details are hidden after one minute or
              when this dialog closes.
            </p>
            <button
              className={styles.secondary}
              onClick={() => {
                setAction(null);
                setRevealed(null);
              }}
            >
              Close protected details
            </button>
          </div>
        ) : (
          <form
            key={`${action?.kind}:${action?.row?.id ?? "new"}`}
            className={styles.form}
            onSubmit={submit}
          >
            {action?.kind === "organization" && (
              <>
                <label>
                  Organisation name
                  <input name="name" required minLength={2} maxLength={100} />
                </label>
                <label>
                  Organisation address
                  <input
                    name="slug"
                    required
                    minLength={3}
                    maxLength={64}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="acme-studio"
                  />
                  <small>Lowercase letters, numbers and hyphens.</small>
                </label>
                <label>
                  First owner’s email
                  <input name="email" type="email" required maxLength={254} />
                  <small>An invitation will be sent to this address.</small>
                </label>
                <label>
                  Contact person (optional)
                  <input name="contactName" minLength={2} maxLength={100} />
                  <small>
                    Record the owner as the primary business contact. You can
                    add other contacts after creation.
                  </small>
                </label>
                <label>
                  Contact phone (optional)
                  <input
                    name="contactPhone"
                    type="tel"
                    pattern="\+[1-9][0-9]{6,14}"
                    maxLength={16}
                    placeholder="+491234567890"
                  />
                  <small>
                    Include the country code and contact person’s name to save
                    this number.
                  </small>
                </label>
              </>
            )}
            {action?.kind === "administrator" && (
              <label>
                Administrator email
                <input name="email" type="email" required maxLength={254} />
              </label>
            )}
            {(action?.kind === "administrator" ||
              action?.kind === "access") && (
              <>
                <label>
                  Platform role
                  <select
                    name="role"
                    defaultValue={String(action.row?.role ?? "auditor")}
                  >
                    <option value="auditor">
                      Auditor — summaries and audit
                    </option>
                    <option value="operator">
                      Operator — organisations and invitations
                    </option>
                    <option value="owner">
                      Owner — full administration and access grants
                    </option>
                  </select>
                </label>
                {action.kind === "access" && (
                  <label>
                    Access
                    <select
                      name="access"
                      defaultValue={
                        action.row?.disabled ? "disabled" : "active"
                      }
                    >
                      <option value="active">Active</option>
                      <option value="disabled">
                        Revoke access and sessions
                      </option>
                    </select>
                  </label>
                )}
              </>
            )}
            {action?.kind === "revoke-sessions" && (
              <p className={styles.muted}>
                This signs the account out of TREVV on every device. Their
                content is unchanged.
              </p>
            )}
            {action?.kind === "reveal" && (
              <p className={styles.muted}>
                Contact details may be used only for a defined operational
                purpose. This read will be recorded.
              </p>
            )}
            <label>
              Reason
              <textarea
                name="reason"
                minLength={10}
                maxLength={240}
                required
                placeholder="Describe the operational reason for this action."
              />
              <small>
                10–240 characters. Do not include confidential content.
              </small>
            </label>
            <button className={styles.primary} disabled={working}>
              {working
                ? "Saving…"
                : action?.kind === "reveal"
                  ? "Record reason and show contact"
                  : action?.kind === "organization"
                    ? "Create and send invitation"
                    : action?.kind === "administrator"
                      ? "Send private invitation"
                      : "Confirm action"}
              <ArrowRight size={16} />
            </button>
          </form>
        )}
      </dialog>
    </main>
  );
}
function date(value: Row[string] | undefined, includeTime = false) {
  if (!value) return "—";
  const result = new Date(String(value));
  return Number.isNaN(result.getTime())
    ? "—"
    : result.toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
        ...(includeTime
          ? ({ hour: "2-digit", minute: "2-digit" } as const)
          : {}),
      });
}

function filterLabel(value: string) {
  const labels: Record<string, string> = {
    all: "All records",
    missing_contact: "Missing primary contact",
    missing_owner: "Awaiting owner",
    review_due: "Review due",
    has_sessions: "Has active sessions",
    no_organization: "No organisation",
    delivery_failed: "Pending delivery failures",
    setup_pending: "Security setup pending",
    contact_access: "Protected contact access",
    changes: "Changes only",
    reads: "Summary views",
    disabled: "Access revoked",
  };
  return (
    labels[value] ??
    value.replaceAll("_", " ").replace(/^./u, (first) => first.toUpperCase())
  );
}
