"use client";

import { dateTimeFormatter } from "@/lib/date-format";

import {
  createApiClient,
  TrevvApiError,
  type TrevvApiClient,
} from "@founderhq/api-client";
import type {
  DataLifecycleRequestDto,
  CreatePrivacyRequestInput,
  PrivacyProgramStatusDto,
  PrivacyRequestKind,
  PrivacyRequestScope,
} from "@founderhq/api-contract";
import { Database, FileClock, RefreshCw, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { useAppSession } from "@/lib/app-session-context";
import { presentLiveError } from "@/lib/live-errors";
import { LiveStateNotice, type LiveStateKind } from "./live-state";
import styles from "./privacy-center.module.css";

const requestKindCopy: Record<PrivacyRequestKind, string> = {
  access: "Access my data",
  portability: "Portable export",
  erasure: "Erase eligible data",
  rectification: "Correct personal data",
  restriction: "Restrict processing",
  objection: "Object to processing",
};

type OrganizationPrivacyRequestKind = Extract<
  PrivacyRequestKind,
  "access" | "portability" | "erasure" | "restriction"
>;

const organizationRequestKinds = new Set<OrganizationPrivacyRequestKind>([
  "access",
  "portability",
  "erasure",
  "restriction",
]);

export function PrivacyCenter() {
  const session = useAppSession();
  const client = useMemo<TrevvApiClient>(
    () => createApiClient({ baseUrl: "/api/v1" }),
    [],
  );
  const [program, setProgram] = useState<PrivacyProgramStatusDto | null>(null);
  const [requests, setRequests] = useState<DataLifecycleRequestDto[]>([]);
  const [loading, setLoading] = useState(!session.demo);
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState("");
  const [kind, setKind] = useState<PrivacyRequestKind>("access");
  const [scope, setScope] = useState<PrivacyRequestScope>("user");
  const canRequestOrganization = new Set(["owner", "admin"]).has(
    session.organization.role,
  );
  const canRequestOrganizationErasure = session.organization.role === "owner";

  const load = useCallback(async () => {
    if (session.demo) return;
    setLoading(true);
    setError(null);
    try {
      const [nextProgram, nextRequests] = await Promise.all([
        client.privacyProgram(),
        client.privacyRequests(),
      ]);
      setProgram(nextProgram);
      setRequests(nextRequests);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  }, [client, session.demo]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("create");
    setError(null);
    setSavedMessage("");
    try {
      const input: CreatePrivacyRequestInput =
        scope === "user"
          ? { kind, scope }
          : {
              kind:
                isOrganizationRequestKind(kind) &&
                (kind !== "erasure" || canRequestOrganizationErasure)
                  ? kind
                  : "access",
              scope,
            };
      const result = await client.createPrivacyRequest(
        input,
        crypto.randomUUID(),
      );
      setRequests((current) => [
        result.data,
        ...current.filter((request) => request.id !== result.data.id),
      ]);
      setSavedMessage(
        "Request submitted for review. No export, erasure, restriction, or provider effect has happened yet.",
      );
    } catch (nextError) {
      setError(nextError);
    } finally {
      setWorking(null);
    }
  }

  async function cancel(request: DataLifecycleRequestDto) {
    setWorking(request.id);
    setError(null);
    setSavedMessage("");
    try {
      const result = await client.cancelPrivacyRequest(
        request.id,
        request.version,
        crypto.randomUUID(),
      );
      setRequests((current) =>
        current.map((entry) =>
          entry.id === result.data.id ? result.data : entry,
        ),
      );
      setSavedMessage("Cancellation recorded durably.");
    } catch (nextError) {
      setError(nextError);
    } finally {
      setWorking(null);
    }
  }

  const presentedError = error ? presentLiveError(error) : null;

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.icon} aria-hidden="true">
            <ShieldCheck size={19} />
          </span>
          <div>
            <p>
              {session.demo
                ? "Fictional demonstration data"
                : "Account and organization data"}
            </p>
            <h1>Privacy center</h1>
            <span>
              {session.demo
                ? "No real request or data-lifecycle effect is available in demo mode."
                : "Requests are durable and auditable; destructive effects require separate review."}
            </span>
          </div>
        </div>
        <Link href="/app/portfolio">Back to Portfolio</Link>
      </header>

      {session.demo ? (
        <LiveStateNotice
          actions={
            <>
              <Link href="/privacy">Privacy information</Link>
              <Link href="/terms">Terms information</Link>
            </>
          }
          description="The fictional demo contains no real account or organization data and cannot submit a real data-subject request."
          kind="empty"
          title="No real data lifecycle in demo mode"
        />
      ) : loading ? (
        <LiveStateNotice
          description="Reading the tenant-scoped privacy program and request history."
          kind="loading"
          title="Loading privacy controls"
        />
      ) : presentedError && !program ? (
        <LiveStateNotice
          actions={
            <button onClick={() => void load()} type="button">
              <RefreshCw size={14} /> Retry
            </button>
          }
          description={presentedError.description}
          kind={errorKind(error)}
          title={presentedError.title}
        />
      ) : program ? (
        <>
          <LiveStateNotice
            description="The repository includes versioned notices and data inventory, but external legal review is still pending. These routes are product information, not legal advice."
            kind="stale"
            title="Privacy notice and terms await legal review"
          />
          {presentedError ? (
            <LiveStateNotice
              actions={
                <button onClick={() => void load()} type="button">
                  Retry
                </button>
              }
              compact
              description={presentedError.description}
              kind={errorKind(error)}
              title={presentedError.title}
            />
          ) : null}
          {savedMessage ? (
            <LiveStateNotice compact kind="saved" title={savedMessage} />
          ) : null}

          <section className={styles.card} aria-labelledby="request-title">
            <header>
              <div>
                <p>Reviewed workflow</p>
                <h2 id="request-title">Submit a privacy request</h2>
              </div>
              <FileClock size={19} aria-hidden="true" />
            </header>
            <form className={styles.form} onSubmit={submit}>
              <label>
                <span>Request</span>
                <select
                  disabled={working !== null}
                  onChange={(event) =>
                    setKind(event.target.value as PrivacyRequestKind)
                  }
                  value={kind}
                >
                  {Object.entries(requestKindCopy)
                    .filter(
                      ([value]) =>
                        scope === "user" ||
                        (isOrganizationRequestKind(value) &&
                          (value !== "erasure" ||
                            canRequestOrganizationErasure)),
                    )
                    .map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Scope</span>
                <select
                  disabled={working !== null}
                  onChange={(event) => {
                    const nextScope = event.target.value as PrivacyRequestScope;
                    setScope(nextScope);
                    if (
                      nextScope === "organization" &&
                      (!isOrganizationRequestKind(kind) ||
                        (kind === "erasure" && !canRequestOrganizationErasure))
                    )
                      setKind("access");
                  }}
                  value={scope}
                >
                  <option value="user">My user data</option>
                  {canRequestOrganization ? (
                    <option value="organization">
                      Entire organization (manager review)
                    </option>
                  ) : null}
                </select>
              </label>
              <button
                className="primary-button"
                disabled={working !== null}
                type="submit"
              >
                {working === "create" ? "Submitting…" : "Submit for review"}
              </button>
            </form>
            <p className={styles.caution}>
              Submission does not mean completed. Identity, legal holds,
              retention, tenant ownership, export delivery, and deletion scope
              must be reviewed before an effect can be recorded.
            </p>
          </section>

          <section className={styles.card} aria-labelledby="history-title">
            <header>
              <div>
                <p>Durable audit trail</p>
                <h2 id="history-title">Request history</h2>
              </div>
              <button
                disabled={working !== null}
                onClick={() => void load()}
                type="button"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            </header>
            {requests.length === 0 ? (
              <LiveStateNotice
                compact
                description="Use the form above when an access, portability, correction, restriction, objection, or erasure request is needed."
                kind="empty"
                title="No privacy requests yet"
              />
            ) : (
              <div className={styles.requestList}>
                {requests.map((request) => {
                  const cancellable =
                    request.requestedBy === session.user.id &&
                    new Set(["submitted", "under_review"]).has(request.status);
                  return (
                    <article key={request.id}>
                      <div>
                        <span className={styles.status}>{request.status}</span>
                        <h3>{requestKindCopy[request.kind]}</h3>
                        <p>
                          {request.scope === "organization"
                            ? "Organization scope"
                            : "User scope"}
                          {" · due for review "}
                          <time dateTime={request.dueAt}>
                            {formatDate(request.dueAt)}
                          </time>
                        </p>
                      </div>
                      {cancellable ? (
                        <button
                          disabled={working !== null}
                          onClick={() => void cancel(request)}
                          type="button"
                        >
                          <X size={14} />
                          {working === request.id ? "Cancelling…" : "Cancel"}
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.card} aria-labelledby="inventory-title">
            <header>
              <div>
                <p>Inventory {program.inventoryVersion}</p>
                <h2 id="inventory-title">Data and retention</h2>
              </div>
              <Database size={19} aria-hidden="true" />
            </header>
            <div className={styles.inventoryGrid}>
              {program.inventory.map((entry) => {
                const retention = program.retention.find(
                  (policy) => policy.category === entry.category,
                );
                return (
                  <article key={entry.category}>
                    <span className={styles.status}>
                      {entry.classification}
                    </span>
                    <h3>{title(entry.category)}</h3>
                    <p>{entry.purpose}</p>
                    <small>
                      {retention?.retentionDays ?? entry.defaultRetentionDays}
                      {" days · "}
                      {retention?.disposition ?? entry.defaultDisposition}
                      {retention?.legalHold ? " · legal hold" : ""}
                      {" · not enforced"}
                    </small>
                  </article>
                );
              })}
            </div>
            <footer className={styles.links}>
              <span>No external provider is configured for revocation.</span>
              <Link href="/privacy">Privacy information</Link>
              <Link href="/terms">Terms information</Link>
            </footer>
          </section>
        </>
      ) : null}
    </main>
  );
}

function isOrganizationRequestKind(
  value: string,
): value is OrganizationPrivacyRequestKind {
  return organizationRequestKinds.has(value as OrganizationPrivacyRequestKind);
}

function errorKind(error: unknown): LiveStateKind {
  if (typeof navigator !== "undefined" && !navigator.onLine) return "offline";
  if (error instanceof TrevvApiError) {
    if (error.status === 401 || error.status === 403) return "permission-loss";
    if (error.status === 409) return "version-conflict";
    if (error.status === 422) return "validation";
    if (error.status === 429) return "rate-limit";
  }
  return "failed";
}

function formatDate(value: string): string {
  return dateTimeFormatter(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function title(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}
