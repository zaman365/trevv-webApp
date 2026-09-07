"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";

import type { AttentionSignalDto } from "@founderhq/api-contract";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppSession } from "@/lib/app-session-context";
import {
  useLiveAppRecords as useLiveAppData,
  useLiveAppRefreshedAt,
} from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { formatLiveDate } from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import { recordKey, retainedKey } from "@/lib/live-work-view-helpers";

export function LiveAttention({ signals }: { signals: AttentionSignalDto[] }) {
  useReportRouteReady(true);
  const session = useAppSession();
  const liveData = useLiveAppData();
  const refreshedAt = useLiveAppRefreshedAt()!;
  const [records, setRecords] = useState(signals);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    signalId: string;
    input: {
      action: "resolve" | "dismiss" | "snooze";
      reason?: string;
      snoozedUntil?: string;
    };
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const active = records.filter(
    (signal) => !signal.resolvedAt && !signal.dismissedAt,
  );

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setRecords(signals), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, signals]);

  async function act(
    signal: AttentionSignalDto,
    action: "resolve" | "dismiss" | "snooze",
  ) {
    const reason =
      action === "resolve"
        ? undefined
        : window
            .prompt(
              action === "dismiss"
                ? "Why is this signal not actionable?"
                : "Why should this signal be snoozed?",
            )
            ?.trim();
    if (action !== "resolve" && !reason) return;
    const input = {
      action,
      ...(reason ? { reason } : {}),
      ...(action === "snooze"
        ? {
            snoozedUntil: new Date(
              Date.parse(refreshedAt) + 86_400_000,
            ).toISOString(),
          }
        : {}),
    };
    await performAttentionAction(signal, input);
  }

  async function performAttentionAction(
    signal: AttentionSignalDto,
    input: {
      action: "resolve" | "dismiss" | "snooze";
      reason?: string;
      snoozedUntil?: string;
    },
  ) {
    const fingerprint = `attention:${signal.id}:${signal.version}:${JSON.stringify(input)}`;
    setPendingId(signal.id);
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.actOnAttention(
        signal.id,
        input,
        signal.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      setRecords((current) =>
        current.map((record) =>
          record.id === response.data.id ? response.data : record,
        ),
      );
      setNotice(
        <LiveStateNotice
          description={`Signal version ${response.data.version} is canonical. This action has no safe inverse in the domain, so Undo is intentionally not offered.`}
          kind="saved"
          title={`Server confirmed ${input.action}`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ signalId: signal.id, input, error: reason });
      } else {
        setNotice(
          <LiveStateNotice
            description={presented.description}
            kind={presented.kind}
            title={presented.title}
          />,
        );
      }
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="attention-signals-title">
      <header>
        <div>
          <p>Computed from canonical records</p>
          <h2 id="attention-signals-title">Open signals</h2>
        </div>
        <span>
          {active.length}
          {liveData.recordsComplete ? " active" : " active loaded"}
        </span>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = (await liveData.client.attention()).find(
                      (signal) => signal.id === conflict.signalId,
                    );
                    if (latest) {
                      setRecords((current) =>
                        current.map((signal) =>
                          signal.id === latest.id ? latest : signal,
                        ),
                      );
                    }
                    setConflict(null);
                  })()
                }
                type="button"
              >
                Load latest
              </button>
              <button
                onClick={() =>
                  void (async () => {
                    const current = conflict;
                    const latest = (await liveData.client.attention()).find(
                      (signal) => signal.id === current.signalId,
                    );
                    if (latest)
                      await performAttentionAction(latest, current.input);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={presentLiveError(conflict.error).description}
          kind="version-conflict"
          title="Choose how to handle the recomputed signal"
        />
      ) : null}
      {active.length === 0 ? (
        <LiveStateNotice
          description={
            liveData.recordsComplete
              ? "The worker found no unresolved deterministic signals."
              : "More workspace records are still arriving."
          }
          kind={liveData.recordsComplete ? "empty" : "loading"}
          title={
            liveData.recordsComplete
              ? "Nothing needs attention"
              : "Loading attention signals"
          }
        />
      ) : (
        <WindowedCollection
          className={styles.stack}
          items={active}
          itemKey={recordKey}
          label="Work records"
        >
          {(signal) => (
            <article
              className={styles.signalCard}
              data-severity={signal.severity}
              data-testid={`attention-signal-${signal.id}`}
              key={signal.id}
            >
              <span className={styles.rowIcon}>
                <Sparkles size={16} />
              </span>
              <div>
                <p>
                  {signal.severity} · {signal.reasonCode}
                </p>
                <h3>{signal.reason}</h3>
                {signal.recommendedAction ? (
                  <span>{signal.recommendedAction}</span>
                ) : null}
                <ul>
                  {signal.sourceEvidence.map((source) => (
                    <li key={`${source.sourceType}:${source.sourceId}`}>
                      <strong>{source.sourceType}</strong> {source.sourceId}
                      {source.summary ? ` · ${source.summary}` : ""}
                      <small>
                        {formatLiveDate(
                          source.capturedAt,
                          session.organization.timezone ?? "UTC",
                        )}
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.rowActions}>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "resolve")}
                  type="button"
                >
                  Resolve
                </button>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "snooze")}
                  type="button"
                >
                  Snooze 24h
                </button>
                <button
                  disabled={pendingId === signal.id}
                  onClick={() => void act(signal, "dismiss")}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </article>
          )}
        </WindowedCollection>
      )}
    </section>
  );
}
