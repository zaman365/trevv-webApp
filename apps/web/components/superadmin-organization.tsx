"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  superadminOrganizationDetailSchema,
  superadminContactSchema,
  type SuperadminOrganizationDetail,
  type SuperadminContact,
  type SuperadminSession,
} from "@founderhq/api-contract/superadmin";
import { superadminRequest } from "@/lib/superadmin-client";
import styles from "./superadmin.module.css";

type Action = {
  kind: "profile" | "add" | "contact" | "remove";
  contact?: SuperadminContact;
};
const contactKinds = ["primary", "billing", "technical", "security", "other"];
export function SuperadminOrganization({
  id,
  session,
}: {
  id: string;
  session: SuperadminSession;
}) {
  const [data, setData] = useState<SuperadminOrganizationDetail | null>(null);
  const [revision, setRevision] = useState(0),
    [loadedRevision, setLoadedRevision] = useState(-1);
  const loading = loadedRevision !== revision;
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [action, setAction] = useState<Action | null>(null),
    [working, setWorking] = useState(false);
  const [revealed, setRevealed] = useState<SuperadminContact | null>(null),
    [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    requestGeneration = useRef(0);
  const base = `/organizations/${encodeURIComponent(id)}`;
  const canOperate = session.role !== "auditor";
  const close = useCallback(() => {
    requestGeneration.current++;
    setAction(null);
    setRevealed(null);
    setReason("");
    setError("");
    setWorking(false);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void superadminRequest(base, undefined, "GET", controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(superadminOrganizationDetailSchema.parse(value));
          setLoadedRevision(revision);
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setData(null);
          setMessage(
            cause instanceof Error
              ? cause.message
              : "Could not load organisation.",
          );
          setLoadedRevision(revision);
        }
      });
    return () => controller.abort();
  }, [base, revision]);
  useEffect(() => {
    if (action) dialog.current?.showModal();
    else dialog.current?.close();
  }, [action]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(close, 60_000);
    const hide = () => {
      if (document.hidden) close();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [revealed, close]);
  useEffect(
    () => () => {
      requestGeneration.current++;
    },
    [],
  );
  function open(next: Action) {
    close();
    setAction(next);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !data) return;
    const form = new FormData(event.currentTarget),
      text = (name: string) => String(form.get(name) ?? "").trim();
    const generation = requestGeneration.current;
    const purpose = revealed ? reason : text("reason");
    setWorking(true);
    setError("");
    try {
      const contactPath = `${base}/contacts/${encodeURIComponent(action.contact?.id ?? "")}`;
      if (action.kind === "contact" && !revealed) {
        const value = await superadminRequest(`${contactPath}/reveal`, {
          reason: purpose,
        });
        if (generation === requestGeneration.current && !document.hidden) {
          setRevealed(superadminContactSchema.parse(value));
          setReason(purpose);
        }
        return;
      }
      if (action.kind === "profile")
        await superadminRequest(
          base,
          {
            legalName: text("legalName"),
            website: text("website"),
            industry: text("industry"),
            country: text("country"),
            city: text("city"),
            stage: text("stage"),
            priority: text("priority"),
            nextReviewAt: text("nextReviewAt") || null,
            version: data.profile.version,
            reason: purpose,
          },
          "PATCH",
        );
      if (action.kind === "add" || action.kind === "contact")
        await superadminRequest(
          action.kind === "add" ? `${base}/contacts` : contactPath,
          {
            kind: text("kind"),
            name: text("name"),
            jobTitle: text("jobTitle"),
            email: text("email"),
            phone: text("phone"),
            version: revealed?.version ?? 0,
            reason: purpose,
          },
          action.kind === "add" ? "POST" : "PATCH",
        );
      if (action.kind === "remove")
        await superadminRequest(
          contactPath,
          { version: action.contact!.version, reason: purpose },
          "DELETE",
        );
      if (generation !== requestGeneration.current) return;
      close();
      setMessage(
        action.kind === "remove"
          ? "Contact removed. The action is recorded without storing a copy of the contact details in the audit trail."
          : "Saved and recorded in the audit trail.",
      );
      setRevision((value) => value + 1);
    } catch (cause) {
      if (generation === requestGeneration.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "The change could not be saved.",
        );
    } finally {
      if (generation === requestGeneration.current) setWorking(false);
    }
  }
  const links = {
    people: `/superadmin/people?organizationId=${encodeURIComponent(id)}`,
    invitations: `/superadmin/invitations?organizationId=${encodeURIComponent(id)}`,
    audit: `/superadmin/audit?q=${encodeURIComponent(id)}`,
  };
  return (
    <main>
      <Link
        href="/superadmin/organizations"
        prefetch={false}
        className={styles.textButton}
      >
        <ArrowLeft size={16} /> All organisations
      </Link>
      <header className={styles.heading}>
        <div>
          <h1>{data?.name ?? "Organisation profile"}</h1>
          <p>
            {data
              ? `${data.slug} · Joined ${date(data.createdAt)}`
              : "Business details, contacts and platform access."}
          </p>
        </div>
        <div className={styles.actions}>
          <button
            className={styles.secondary}
            disabled={loading}
            onClick={() => {
              setMessage("");
              setRevision((value) => value + 1);
            }}
          >
            <RefreshCw size={16} /> Refresh
          </button>
          {canOperate && data && (
            <button
              className={styles.primary}
              disabled={loading}
              onClick={() => open({ kind: "profile" })}
            >
              Edit profile
            </button>
          )}
        </div>
      </header>
      {message && (
        <p className={styles.notice} role="status">
          {message}
        </p>
      )}
      {!data ? (
        <section
          className={`${styles.panel} ${styles.empty}`}
          aria-busy={loading}
        >
          <Building2 size={28} />
          <h2>
            {loading ? "Loading organisation…" : "Organisation unavailable"}
          </h2>
          <p>
            {loading
              ? "Retrieving its operational information."
              : "Refresh to try again, or return to the organisations list."}
          </p>
        </section>
      ) : (
        <>
          <section className={styles.metrics} aria-label="Organisation totals">
            {[
              {
                label: "Members",
                value: data.memberCount,
                detail: `${data.ownerCount} owners`,
                href: links.people,
              },
              {
                label: "Workspaces",
                value: data.workspaceCount,
                detail: "Active workspaces",
              },
              {
                label: "Pending invitations",
                value: data.pendingInvitations,
                detail: `${data.failedDeliveries} delivery failures`,
                href: links.invitations,
              },
              {
                label: "Business contacts",
                value: data.contacts.length,
                detail: data.contacts.some((c) => c.kind === "primary")
                  ? "Primary contact recorded"
                  : "Primary contact missing",
              },
            ].map((item) => (
              <article className={styles.metric} key={item.label}>
                <p>{item.label}</p>
                <strong>{item.value}</strong>
                {item.href ? (
                  <Link href={item.href} prefetch={false}>
                    {item.detail} <ArrowRight size={13} />
                  </Link>
                ) : (
                  <span>{item.detail}</span>
                )}
              </article>
            ))}
          </section>
          <div className={styles.twoColumns}>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Business information</h2>
                <Building2 size={20} />
              </header>
              <div className={styles.panelBody}>
                <dl className={styles.detailGrid}>
                  <Detail label="Legal name" value={data.profile.legalName} />
                  <div>
                    <dt>Website</dt>
                    <dd>
                      {data.profile.website ? (
                        <a
                          href={data.profile.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.textButton}
                        >
                          {data.profile.website}
                        </a>
                      ) : (
                        "Not provided"
                      )}
                    </dd>
                  </div>
                  <Detail label="Industry" value={data.profile.industry} />
                  <Detail
                    label="Country / region"
                    value={data.profile.country}
                  />
                  <Detail label="City" value={data.profile.city} />
                  <Detail label="Time zone" value={data.timezone} />
                  <Detail label="Language" value={data.locale} />
                  <Detail label="Organisation ID" value={data.id} />
                </dl>
                <p className={styles.privacyFoot}>
                  Profile updated{" "}
                  {data.updatedAt
                    ? date(data.updatedAt, true)
                    : "— not yet completed"}
                  .
                </p>
              </div>
            </section>
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <h2>Onboarding & follow-up</h2>
                <ShieldCheck size={20} />
              </header>
              <div className={styles.panelBody}>
                <div className={styles.statLine}>
                  <span>Relationship stage</span>
                  <span className={styles.badge}>
                    {label(data.profile.stage)}
                  </span>
                </div>
                <div className={styles.statLine}>
                  <span>Support priority</span>
                  <span
                    className={`${styles.badge} ${data.profile.priority === "urgent" ? styles.warn : ""}`}
                  >
                    {data.profile.priority}
                  </span>
                </div>
                <div className={styles.statLine}>
                  <span>Next review (UTC)</span>
                  <strong>
                    {data.profile.nextReviewAt
                      ? date(data.profile.nextReviewAt)
                      : "Not scheduled"}
                  </strong>
                </div>
                <ul className={styles.checklist}>
                  <li>
                    <span
                      className={data.ownerCount ? styles.good : styles.warn}
                    >
                      {data.ownerCount ? "Ready" : "Action"}
                    </span>
                    {data.ownerCount ? (
                      "Organisation owner has joined"
                    ) : (
                      <Link href={links.invitations} prefetch={false}>
                        Review owner invitation
                      </Link>
                    )}
                  </li>
                  <li>
                    <span
                      className={
                        data.contacts.some((c) => c.kind === "primary")
                          ? styles.good
                          : styles.warn
                      }
                    >
                      {data.contacts.some((c) => c.kind === "primary")
                        ? "Ready"
                        : "Action"}
                    </span>
                    Primary business contact
                  </li>
                  <li>
                    <span
                      className={
                        data.failedDeliveries ? styles.warn : styles.good
                      }
                    >
                      {data.failedDeliveries ? "Action" : "Clear"}
                    </span>
                    <Link
                      href={`${links.invitations}&filter=delivery_failed`}
                      prefetch={false}
                    >
                      {data.failedDeliveries
                        ? "Resolve invitation delivery failures"
                        : "No pending delivery failures"}
                    </Link>
                  </li>
                </ul>
                <p className={styles.muted}>
                  Stage and priority organise your follow-up. They do not change
                  account access.
                </p>
              </div>
            </section>
          </div>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <h2>Contact people</h2>
                <p>
                  Primary, billing, technical and security contacts ·{" "}
                  {data.contacts.length} / 12
                </p>
              </div>
              {canOperate && (
                <button
                  className={styles.secondary}
                  disabled={data.contacts.length >= 12 || loading}
                  onClick={() => open({ kind: "add" })}
                >
                  <Plus size={16} /> Add contact
                </button>
              )}
            </header>
            {data.contacts.length ? (
              <div className={styles.contactGrid}>
                {[...data.contacts]
                  .sort(
                    (a, b) =>
                      Number(b.kind === "primary") -
                      Number(a.kind === "primary"),
                  )
                  .map((contact) => (
                    <article className={styles.contactCard} key={contact.id}>
                      <span className={styles.badge}>{contact.kind}</span>
                      <h3>{contact.name}</h3>
                      <p>{contact.email}</p>
                      <p>{contact.phone || "Phone not provided"}</p>
                      <small>Updated {date(contact.updatedAt)}</small>
                      {canOperate && (
                        <div className={styles.tableActions}>
                          <button
                            className={styles.textButton}
                            onClick={() => open({ kind: "contact", contact })}
                          >
                            <Eye size={15} /> View / edit contact
                          </button>
                          <button
                            className={styles.textButton}
                            onClick={() => open({ kind: "remove", contact })}
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <Eye size={28} />
                <h3>No business contacts recorded</h3>
                <p>
                  Add the person who handles this organisation’s relationship
                  with TREVV. You can keep separate billing and security
                  contacts.
                </p>
              </div>
            )}
          </section>
          <div className={styles.quickLinks}>
            <Link href={links.people} prefetch={false}>
              Review members <ArrowRight size={16} />
            </Link>
            <Link href={links.invitations} prefetch={false}>
              Manage invitations <ArrowRight size={16} />
            </Link>
            <Link href={links.audit} prefetch={false}>
              Organisation audit trail <ArrowRight size={16} />
            </Link>
          </div>
          <p className={styles.privacyFoot}>
            <ShieldCheck size={16} /> Contacts are masked by default. Viewing
            requires a recorded purpose and recent verification. Adding a
            contact does not invite them or grant access.
          </p>
        </>
      )}
      <dialog
        ref={dialog}
        className={`${styles.root} ${styles.modal}`}
        aria-labelledby="org-dialog-title"
        onCancel={close}
        onClose={close}
      >
        <header className={styles.panelHeader}>
          <h2 id="org-dialog-title">
            {action?.kind === "profile"
              ? "Edit organisation profile"
              : action?.kind === "add"
                ? "Add business contact"
                : action?.kind === "remove"
                  ? "Remove business contact"
                  : revealed
                    ? "Business contact details"
                    : "View protected contact"}
          </h2>
          <button
            className={styles.textButton}
            type="button"
            aria-label="Close dialog"
            onClick={close}
            disabled={working}
          >
            <X size={20} />
          </button>
        </header>
        {error && (
          <p className={styles.notice} role="alert">
            {error}{" "}
            <Link href="/superadmin/security" prefetch={false}>
              Verify in security settings
            </Link>
          </p>
        )}
        {action && data && (
          <form
            key={`${action.kind}:${action.contact?.id ?? "new"}:${revealed ? "revealed" : "masked"}`}
            className={styles.form}
            onSubmit={submit}
            autoComplete="off"
          >
            {action.kind === "profile" && (
              <>
                <p className={styles.muted}>
                  Keep business information current for onboarding and support.
                </p>
                <label>
                  Legal name
                  <input
                    name="legalName"
                    maxLength={160}
                    defaultValue={data.profile.legalName}
                  />
                </label>
                <label>
                  Website
                  <input
                    name="website"
                    type="url"
                    maxLength={300}
                    placeholder="https://example.com"
                    pattern="https?://.*"
                    defaultValue={data.profile.website}
                  />
                </label>
                <label>
                  Industry
                  <input
                    name="industry"
                    maxLength={100}
                    defaultValue={data.profile.industry}
                  />
                </label>
                <div className={styles.formColumns}>
                  <label>
                    Country / region
                    <input
                      name="country"
                      maxLength={80}
                      defaultValue={data.profile.country}
                    />
                  </label>
                  <label>
                    City
                    <input
                      name="city"
                      maxLength={100}
                      defaultValue={data.profile.city}
                    />
                  </label>
                </div>
                <div className={styles.formColumns}>
                  <label>
                    Relationship stage
                    <select name="stage" defaultValue={data.profile.stage}>
                      <option value="onboarding">Onboarding</option>
                      <option value="established">Established</option>
                      <option value="needs_review">Needs review</option>
                    </select>
                  </label>
                  <label>
                    Support priority
                    <select
                      name="priority"
                      defaultValue={data.profile.priority}
                    >
                      <option value="standard">Standard</option>
                      <option value="priority">Priority</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                </div>
                <label>
                  Next review date (UTC)
                  <input
                    name="nextReviewAt"
                    type="date"
                    defaultValue={data.profile.nextReviewAt ?? ""}
                  />
                </label>
              </>
            )}
            {(action.kind === "add" || revealed) && (
              <>
                {revealed && (
                  <p className={styles.notice}>
                    Access recorded. Details and unsaved edits close after one
                    minute or when you leave this tab.
                  </p>
                )}
                <label>
                  Contact responsibility
                  <select
                    name="kind"
                    defaultValue={
                      revealed?.kind ??
                      (data.contacts.some((c) => c.kind === "primary")
                        ? "other"
                        : "primary")
                    }
                  >
                    {contactKinds.map((kind) => (
                      <option
                        value={kind}
                        key={kind}
                        disabled={
                          kind === "primary" &&
                          data.contacts.some(
                            (c) =>
                              c.kind === "primary" && c.id !== revealed?.id,
                          )
                        }
                      >
                        {label(kind)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Contact person
                  <input
                    name="name"
                    minLength={2}
                    maxLength={100}
                    required
                    defaultValue={revealed?.name}
                  />
                </label>
                <label>
                  Job title
                  <input
                    name="jobTitle"
                    maxLength={100}
                    defaultValue={revealed?.jobTitle}
                  />
                </label>
                <label>
                  Business email
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    defaultValue={revealed?.email}
                  />
                </label>
                <label>
                  Phone number
                  <input
                    name="phone"
                    type="tel"
                    pattern="\+[1-9][0-9]{6,14}"
                    maxLength={16}
                    placeholder="+491234567890"
                    defaultValue={revealed?.phone}
                  />
                  <small>
                    Optional. Include country code. This is a contact number,
                    not an authentication method.
                  </small>
                </label>
                {!revealed && (
                  <p className={styles.muted}>
                    Record only current business contacts you are authorised to
                    hold. No invitation is sent.
                  </p>
                )}
              </>
            )}
            {action.kind === "remove" && (
              <p>
                This removes the {action.contact?.kind} contact{" "}
                {action.contact?.name} and their saved contact details. Their
                TREVV account and access stay unchanged.
              </p>
            )}
            {!revealed && (
              <label>
                Reason for{" "}
                {action.kind === "contact" ? "access" : "this change"}
                <textarea
                  name="reason"
                  required
                  minLength={10}
                  maxLength={240}
                  placeholder="Explain the operational purpose…"
                />
                <small>
                  Recorded in the audit trail. Do not include personal details
                  or customer content.
                </small>
              </label>
            )}
            {revealed && <p className={styles.muted}>Purpose: {reason}</p>}
            <button
              className={
                action.kind === "remove" ? styles.danger : styles.primary
              }
              disabled={working}
            >
              {working
                ? "Working…"
                : action.kind === "contact" && !revealed
                  ? "Reveal for one minute"
                  : action.kind === "remove"
                    ? "Remove contact"
                    : "Save changes"}
            </button>
          </form>
        )}
      </dialog>
    </main>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value || "Not provided"}</dd>
    </div>
  );
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./u, (first) => first.toUpperCase());
}
function date(value: string, time = false) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" as const } : {}),
    timeZone: "UTC",
  }).format(new Date(value));
}
