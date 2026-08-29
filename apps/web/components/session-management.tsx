"use client";

import {
  Laptop,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAppSession } from "@/lib/app-session-context";
import type { RedactedSession } from "@/lib/session-route";

export function SessionManagement() {
  const appSession = useAppSession();
  const [sessions, setSessions] = useState<RedactedSession[]>([]);
  const [loading, setLoading] = useState(!appSession.demo);
  const [message, setMessage] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (appSession.demo) return;
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/web/sessions", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body: unknown = await response.json();
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(errorMessage(body, "Sessions could not be loaded."));
      }
      setSessions(body as RedactedSession[]);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sessions could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [appSession.demo]);

  useEffect(() => {
    const task = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(task);
  }, [load]);

  async function revoke(session: RedactedSession) {
    setWorkingId(session.id);
    setMessage("");
    try {
      const response = await fetch(
        session.current
          ? "/api/web/sign-out"
          : `/api/web/sessions/${encodeURIComponent(session.id)}`,
        {
          method: session.current ? "POST" : "DELETE",
          credentials: "same-origin",
        },
      );
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          errorMessage(body, "The session could not be revoked."),
        );
      if (session.current) {
        window.location.replace("/sign-in?signedOut=1");
        return;
      }
      setSessions((current) =>
        current.filter((entry) => entry.id !== session.id),
      );
      setMessage("Session revoked. That browser must sign in again.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The session could not be revoked.",
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function revokeAll() {
    setWorkingId("all");
    setMessage("");
    try {
      const response = await fetch("/api/web/sessions/revoke-all", {
        method: "POST",
        credentials: "same-origin",
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(errorMessage(body, "Sessions could not be revoked."));
      window.location.replace("/sign-in?signedOut=all");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Sessions could not be revoked.",
      );
      setWorkingId(null);
    }
  }

  async function signOut() {
    setWorkingId("current");
    setMessage("");
    try {
      const response = await fetch("/api/web/sign-out", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok)
        throw new Error("This browser could not be signed out.");
      window.location.replace("/sign-in?signedOut=1");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "This browser could not be signed out.",
      );
      setWorkingId(null);
    }
  }

  return (
    <main className="session-page">
      <header className="session-page-header">
        <div>
          <span className="settings-list-icon">
            <ShieldCheck size={19} />
          </span>
          <div>
            <p>Account security</p>
            <h1>Sessions</h1>
            <span>
              {appSession.demo
                ? "Authentication is disabled in this fictional demo."
                : `Signed in as ${appSession.user.email} in ${appSession.organization.name}.`}
            </span>
          </div>
        </div>
        <Link href="/app/portfolio">Back to Portfolio</Link>
      </header>

      {appSession.demo ? (
        <section className="settings-card session-empty-state">
          <h2>No real sessions in demo mode</h2>
          <p>
            This surface deliberately shows no fictional devices or simulated
            security controls. Start TREVV in live mode to manage real sessions.
          </p>
        </section>
      ) : (
        <section className="settings-card">
          <div className="session-management-heading">
            <div>
              <h2>Signed-in browsers</h2>
              <p>Revocation takes effect on the next authorized request.</p>
            </div>
            <button
              disabled={loading}
              onClick={() => void load()}
              type="button"
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>

          {loading ? <p role="status">Loading active sessions…</p> : null}
          {!loading && sessions.length === 0 && !message ? (
            <p>No active sessions were returned.</p>
          ) : null}
          <div className="session-list">
            {sessions.map((session) => {
              const mobile = /mobile|android|iphone/i.test(
                session.userAgent ?? "",
              );
              const Device = mobile ? Smartphone : Laptop;
              return (
                <article key={session.id}>
                  <span className="settings-list-icon">
                    <Device size={17} />
                  </span>
                  <div>
                    <strong>{deviceName(session.userAgent)}</strong>
                    <span>{session.ipAddress ?? "IP address unavailable"}</span>
                    <small>
                      Last active {formatDate(session.updatedAt)} · expires{" "}
                      {formatDate(session.expiresAt)}
                    </small>
                  </div>
                  <button
                    disabled={workingId !== null}
                    onClick={() => void revoke(session)}
                    type="button"
                  >
                    {workingId === session.id
                      ? "Revoking…"
                      : session.current
                        ? "Revoke this session"
                        : "Revoke"}
                  </button>
                </article>
              );
            })}
          </div>

          {message ? (
            <p className="auth-message" role="status">
              {message}
            </p>
          ) : null}

          <footer className="session-actions">
            <button
              disabled={workingId !== null}
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut size={14} /> Sign out this browser
            </button>
            <button
              className="danger-button"
              disabled={workingId !== null}
              onClick={() => void revokeAll()}
              type="button"
            >
              {workingId === "all" ? "Revoking…" : "Revoke all sessions"}
            </button>
          </footer>
        </section>
      )}
    </main>
  );
}

function errorMessage(value: unknown, fallback: string): string {
  return value &&
    typeof value === "object" &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string"
    ? (value as { error: string }).error
    : fallback;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function deviceName(userAgent: string | null): string {
  if (!userAgent) return "Unknown browser";
  const browser = /edg/i.test(userAgent)
    ? "Edge"
    : /firefox/i.test(userAgent)
      ? "Firefox"
      : /chrome|crios/i.test(userAgent)
        ? "Chrome"
        : /safari/i.test(userAgent)
          ? "Safari"
          : "Browser";
  const platform = /iphone|ipad/i.test(userAgent)
    ? "iOS"
    : /android/i.test(userAgent)
      ? "Android"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /macintosh|mac os/i.test(userAgent)
          ? "macOS"
          : "device";
  return `${browser} on ${platform}`;
}
