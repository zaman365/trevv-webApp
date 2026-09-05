"use client";

import { dateTimeFormatter } from "@/lib/date-format";

import {
  AlertCircle,
  CheckCircle2,
  CircleSlash2,
  Clock3,
  CloudOff,
  LoaderCircle,
  RefreshCw,
  SearchX,
  ShieldAlert,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLiveAppRefreshedAt } from "@/lib/live-app-freshness";
import { formatLiveDate } from "@/lib/live-workflow-ui";
import styles from "./live-state.module.css";

export type LiveStateKind =
  | "loading"
  | "empty"
  | "no-results"
  | "pending"
  | "saved"
  | "failed"
  | "retrying"
  | "stale"
  | "offline"
  | "permission-loss"
  | "validation"
  | "rate-limit"
  | "version-conflict"
  | "terminal-error";

const icons = {
  loading: LoaderCircle,
  empty: CircleSlash2,
  "no-results": SearchX,
  pending: Clock3,
  saved: CheckCircle2,
  failed: AlertCircle,
  retrying: RefreshCw,
  stale: Clock3,
  offline: CloudOff,
  "permission-loss": ShieldAlert,
  validation: AlertCircle,
  "rate-limit": TriangleAlert,
  "version-conflict": TriangleAlert,
  "terminal-error": AlertCircle,
} satisfies Record<LiveStateKind, typeof AlertCircle>;

export function LiveStateNotice({
  kind,
  title,
  description,
  lastSyncedAt,
  synced = false,
  actions,
  compact = false,
  role,
}: {
  kind: LiveStateKind;
  title: string;
  description?: string;
  lastSyncedAt?: string | Date;
  synced?: boolean;
  actions?: ReactNode;
  compact?: boolean;
  role?: "alert" | "status";
}) {
  const Icon = icons[kind];
  const timestamp = lastSyncedAt
    ? dateTimeFormatter(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(
        typeof lastSyncedAt === "string"
          ? new Date(lastSyncedAt)
          : lastSyncedAt,
      )
    : undefined;

  return (
    <section
      className={`${styles.state} ${styles[kind]} ${compact ? styles.compact : ""}`}
      data-live-state={kind}
      role={role ?? (isAssertive(kind) ? "alert" : "status")}
    >
      <span className={styles.icon} aria-hidden="true">
        <Icon size={17} />
      </span>
      <div className={styles.copy}>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
        {timestamp ? (
          <small className={styles.timestamp}>Last synced {timestamp}</small>
        ) : synced ? (
          <small className={styles.timestamp}>
            Last synced <LiveSyncedAt />
          </small>
        ) : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </section>
  );
}

/** Only the timestamp subscribes to successful unchanged background polls. */
export function LiveSyncedAt({ timezone }: { timezone?: string }) {
  const refreshedAt = useLiveAppRefreshedAt();
  return refreshedAt
    ? formatLiveDate(
        refreshedAt,
        timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      )
    : null;
}

export function RouteLoadingState({ label = "Loading current data" }) {
  return (
    <main className={styles.shell} aria-busy="true" aria-label={label}>
      <div className={styles.skeleton} aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="sr-only">{label}…</span>
    </main>
  );
}

export function RouteFailureState({
  title,
  description,
  requestId,
  onRetry,
}: {
  title: string;
  description: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <main className={styles.shell}>
      <LiveStateNotice
        kind="terminal-error"
        title={title}
        description={`${description}${requestId ? ` Reference: ${requestId}.` : ""}`}
        actions={
          onRetry ? (
            <button type="button" onClick={onRetry}>
              Try again
            </button>
          ) : undefined
        }
      />
    </main>
  );
}

function isAssertive(kind: LiveStateKind): boolean {
  return new Set<LiveStateKind>([
    "failed",
    "permission-loss",
    "validation",
    "rate-limit",
    "version-conflict",
    "terminal-error",
  ]).has(kind);
}
