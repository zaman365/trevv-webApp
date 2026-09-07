"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";

import type { WaitingStateDto } from "@founderhq/api-contract";
import { Clock3 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import { formatLiveDateOnly } from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import { recordKey, retainedKey } from "@/lib/live-work-view-helpers";

export function LiveWaiting({
  records: source,
}: {
  records: WaitingStateDto[];
}) {
  useReportRouteReady(true);
  const session = useAppSession();
  const liveData = useLiveAppData();
  const [records, setRecords] = useState(source);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    recordId: string;
    input: {
      action: "resolve" | "nudge" | "reschedule";
      note?: string;
      nextFollowUp?: string;
    };
    error: unknown;
  } | null>(null);
  const retryKeys = useRef(new Map<string, string>());
  const active = records.filter((record) => !record.resolvedAt);

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setRecords(source), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, source]);

  async function act(
    record: WaitingStateDto,
    action: "resolve" | "nudge" | "reschedule",
  ) {
    const note = window
      .prompt(
        action === "nudge"
          ? "Record the follow-up that was sent"
          : action === "resolve"
            ? "Record how the wait was resolved"
            : "Why is the follow-up moving?",
      )
      ?.trim();
    if (note === undefined) return;
    const nextFollowUp =
      action === "reschedule"
        ? window.prompt("New follow-up date (YYYY-MM-DD)")?.trim()
        : undefined;
    if (action === "reschedule" && !nextFollowUp) return;
    const input = {
      action,
      ...(note ? { note } : {}),
      ...(nextFollowUp ? { nextFollowUp } : {}),
    };
    await performWaitingAction(record, input);
  }

  async function performWaitingAction(
    record: WaitingStateDto,
    input: {
      action: "resolve" | "nudge" | "reschedule";
      note?: string;
      nextFollowUp?: string;
    },
  ) {
    const fingerprint = `waiting:${record.id}:${record.version}:${JSON.stringify(input)}`;
    setPendingId(record.id);
    setNotice(null);
    setConflict(null);
    try {
      const response = await liveData.client.actOnWaiting(
        record.id,
        input,
        record.version,
        retainedKey(retryKeys.current, fingerprint),
      );
      retryKeys.current.delete(fingerprint);
      setRecords((current) =>
        current.map((candidate) =>
          candidate.id === response.data.id ? response.data : candidate,
        ),
      );
      setNotice(
        <LiveStateNotice
          description={`Waiting version ${response.data.version} is canonical. ${input.action === "resolve" ? "Resolution has no safe reopen transition, so Undo is not offered." : "The follow-up history remains durable."}`}
          kind="saved"
          title={`Server confirmed ${input.action}`}
        />,
      );
      await liveData.refresh();
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ recordId: record.id, input, error: reason });
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
    <section className={styles.panel} aria-labelledby="waiting-records-title">
      <header>
        <div>
          <p>Durable follow-up ownership</p>
          <h2 id="waiting-records-title">Active waits</h2>
        </div>
      </header>
      {notice}
      {conflict ? (
        <LiveStateNotice
          actions={
            <>
              <button
                onClick={() =>
                  void (async () => {
                    const latest = (await liveData.client.waiting()).find(
                      (record) => record.id === conflict.recordId,
                    );
                    if (latest) {
                      setRecords((current) =>
                        current.map((record) =>
                          record.id === latest.id ? latest : record,
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
                    const latest = (await liveData.client.waiting()).find(
                      (record) => record.id === current.recordId,
                    );
                    if (latest)
                      await performWaitingAction(latest, current.input);
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
          title="Choose how to handle the newer Waiting record"
        />
      ) : null}
      {active.length === 0 ? (
        <LiveStateNotice
          description={
            liveData.recordsComplete
              ? "No canonical work is waiting on a dependency."
              : "More workspace records are still arriving."
          }
          kind={liveData.recordsComplete ? "empty" : "loading"}
          title={
            liveData.recordsComplete
              ? "Waiting is clear"
              : "Loading waiting records"
          }
        />
      ) : (
        <WindowedCollection
          className={styles.stack}
          items={active}
          itemKey={recordKey}
          label="Work records"
        >
          {(record) => (
            <article
              className={styles.waitingCard}
              data-testid={`waiting-record-${record.id}`}
              key={record.id}
            >
              <span className={styles.rowIcon}>
                <Clock3 size={16} />
              </span>
              <div>
                <p>
                  {record.waitingType.replaceAll("_", " ")} · v{record.version}
                </p>
                <h3>{record.title}</h3>
                <span>
                  {record.waitingLabel ||
                    record.waitingNote ||
                    "No waiting note"}
                </span>
                <small>
                  Waiting since{" "}
                  {formatLiveDateOnly(
                    record.waitingSince,
                    session.organization.timezone ?? "UTC",
                  )}
                  {record.nextFollowUp
                    ? ` · Follow up ${formatLiveDateOnly(record.nextFollowUp, session.organization.timezone ?? "UTC")}`
                    : ""}
                </small>
              </div>
              <div className={styles.rowActions}>
                <button
                  data-testid={`waiting-nudge-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "nudge")}
                  type="button"
                >
                  Nudge
                </button>
                <button
                  data-testid={`waiting-reschedule-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "reschedule")}
                  type="button"
                >
                  Reschedule
                </button>
                <button
                  data-testid={`waiting-resolve-${record.id}`}
                  disabled={pendingId === record.id}
                  onClick={() => void act(record, "resolve")}
                  type="button"
                >
                  Resolve
                </button>
              </div>
            </article>
          )}
        </WindowedCollection>
      )}
    </section>
  );
}
