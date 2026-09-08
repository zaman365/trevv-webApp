"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { RefreshCw } from "lucide-react";
import { useOptionalLiveAppRecords } from "@/lib/live-app-data";
import { useLiveAppRefreshedAt } from "@/lib/live-app-freshness";
import { presentLiveReadError } from "@/lib/live-errors";
import { LiveSyncedAt } from "./live-state";
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
}: {
  children: ReactNode;
}) {
  return (
    <RefreshStatusProvided.Provider value={true}>
      <LiveRefreshStatusView />
      {children}
    </RefreshStatusProvided.Provider>
  );
}

/** Standalone pages retain connection details and retry without a second banner. */
export function LiveRefreshStatus() {
  const provided = useContext(RefreshStatusProvided);
  return provided ? null : <LiveRefreshStatusView />;
}

function LiveRefreshStatusView() {
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
  return (
    <div
      className={styles.bar}
      data-sync-status={state}
      role="group"
      aria-label="Workspace connection"
    >
      <span className={styles.label}>
        <span className={styles.dot} aria-hidden="true" />
        {title}
      </span>
      <span className="sr-only" role="status" aria-atomic="true">
        {announce && visible ? title : ""}
      </span>
      <div className={styles.controls}>
        <button
          type="button"
          aria-label="Refresh connection"
          title="Refresh connection"
          disabled={data.refreshing || !online}
          onClick={() => void data.refresh()}
        >
          <RefreshCw size={15} aria-hidden="true" />
        </button>
        <details className={styles.details}>
          <summary>Connection details</summary>
          <div className={styles.panel}>
            <strong>{title}</strong>
            <p>{description}</p>
            <small>Last checked {checked ? <LiveSyncedAt /> : "Not yet"}</small>
            {data.accessLost ? <a href="/sign-in">Return to sign in</a> : null}
          </div>
        </details>
      </div>
    </div>
  );
}
