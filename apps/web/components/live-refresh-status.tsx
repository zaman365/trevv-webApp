"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useOptionalLiveAppRecords } from "@/lib/live-app-data";
import { useLiveAppRefreshedAt } from "@/lib/live-app-freshness";
import { presentLiveReadError } from "@/lib/live-errors";
import { LiveSyncedAt } from "./live-state";
import { TechnicalPreviewBadge } from "./capability-status";
import styles from "./live-refresh-status.module.css";

const RefreshStatusProvided = createContext(false);
const retryGraceMs = 10_000;

function subscribeVisibility(notify: () => void) {
  document.addEventListener("visibilitychange", notify);
  return () => document.removeEventListener("visibilitychange", notify);
}
function subscribeNetwork(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

/** Delay only background announcements, never the underlying error/access state. */
function useSustainedInterruption(interrupted: boolean) {
  const [episode, setEpisode] = useState({ interrupted, sustained: false });
  if (episode.interrupted !== interrupted)
    setEpisode({ interrupted, sustained: false });
  useEffect(() => {
    if (!interrupted) return;
    const timer = window.setTimeout(
      () => setEpisode({ interrupted: true, sustained: true }),
      retryGraceMs,
    );
    return () => window.clearTimeout(timer);
  }, [interrupted]);
  return interrupted && episode.interrupted && episode.sustained;
}

/** The persistent shell owns one connection surface across all its pages. */
export function LiveRefreshStatusBoundary({
  children,
  statusInHeader = false,
}: {
  children: ReactNode;
  statusInHeader?: boolean;
}) {
  return (
    <RefreshStatusProvided.Provider value={true}>
      {statusInHeader ? null : <LiveRefreshStatusView />}
      {children}
    </RefreshStatusProvided.Provider>
  );
}

/** Share the existing preview badge's header space without adding a page row. */
export function LiveHeaderRefreshStatus() {
  return <LiveRefreshStatusView compact />;
}

/** Standalone pages retain connection details and retry without a second banner. */
export function LiveRefreshStatus() {
  const provided = useContext(RefreshStatusProvided);
  return provided ? null : <LiveRefreshStatusView />;
}

function LiveRefreshStatusView({ compact = false }: { compact?: boolean }) {
  const data = useOptionalLiveAppRecords();
  const refreshedAt = useLiveAppRefreshedAt();
  const visible = useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState !== "hidden",
    () => true,
  );
  const online = useSyncExternalStore(
    subscribeNetwork,
    () => navigator.onLine,
    () => true,
  );
  const sustained = useSustainedInterruption(Boolean(data?.stale && visible));
  if (!data) return null;
  const checked = Boolean(refreshedAt && Date.parse(refreshedAt) > 0);
  const interrupted = sustained || (!checked && Boolean(data.error));
  const state = data.accessLost
    ? "access-lost"
    : !online
      ? "offline"
      : interrupted
        ? "interrupted"
        : data.stale || data.refreshing || !checked
          ? "checking"
          : "connected";
  const title = {
    connected: "Up to date",
    checking: "Checking for updates…",
    interrupted: "Updates delayed",
    offline: "Offline",
    "access-lost": "Access changed",
  }[state];
  const announce = ["interrupted", "offline", "access-lost"].includes(state);
  const description = data.accessLost
    ? "Your access has changed. Sign in again or ask an organization owner to restore access."
    : data.error
      ? presentLiveReadError(data.error).description
      : data.stale || !online
        ? "Showing the last checked records while TREVV reconnects. Your drafts stay in place."
        : "The latest workspace updates have been checked. This connection status is separate from task save confirmations.";
  const label = (
    <span className={styles.label}>
      <span className={styles.dot} aria-hidden="true" />
      {title}
      {compact ? <ChevronDown size={12} aria-hidden="true" /> : null}
    </span>
  );
  const refresh = (
    <button
      className={compact ? styles.panelRefresh : undefined}
      type="button"
      aria-label="Refresh connection"
      title="Refresh connection"
      disabled={data.refreshing || !online}
      onClick={() => void data.refresh()}
    >
      <RefreshCw size={15} aria-hidden="true" />
      {compact ? "Refresh connection" : null}
    </button>
  );
  return (
    <div
      className={`${styles.bar}${compact ? ` ${styles.compact}` : ""}`}
      data-sync-status={state}
      role="group"
      aria-label="Workspace connection"
    >
      {compact ? null : label}
      <span className="sr-only" role="status" aria-atomic="true">
        {announce && visible ? title : ""}
      </span>
      <div className={styles.controls}>
        {compact ? null : refresh}
        <details className={styles.details}>
          <summary
            aria-label={compact ? `Connection details: ${title}` : undefined}
            title={compact ? "Connection details" : undefined}
          >
            {compact ? (
              <>
                <TechnicalPreviewBadge mode="live" />
                {label}
              </>
            ) : (
              "Connection details"
            )}
          </summary>
          <div className={styles.panel}>
            <strong>{title}</strong>
            <p>{description}</p>
            <small>Last checked {checked ? <LiveSyncedAt /> : "Not yet"}</small>
            {compact ? refresh : null}
            {data.accessLost ? <a href="/sign-in">Return to sign in</a> : null}
          </div>
        </details>
      </div>
    </div>
  );
}
