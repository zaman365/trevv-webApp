"use client";

import type {
  WeeklyReviewRecordDto,
  WorkspaceSnapshotDto,
} from "@founderhq/api-contract";
import { useEffect, useState, type FormEvent } from "react";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  formatLiveDate,
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

interface WeeklyReviewDraft {
  health: "on_track" | "watch" | "critical" | "parked";
  progress: string;
  blocker: string;
  nextMilestone: string;
  decisionNeeded: string;
  priorityNextWeek: string;
  attemptedFingerprint: string;
}

const emptyReview: WeeklyReviewDraft = {
  health: "on_track",
  progress: "",
  blocker: "None",
  nextMilestone: "",
  decisionNeeded: "",
  priorityNextWeek: "",
  attemptedFingerprint: "",
};

export function LiveWeeklyReview({ workspaceId }: { workspaceId: string }) {
  const session = useAppSession();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `weekly-review:${workspaceId}`,
  });
  const [draft, setDraft] = useState(emptyReview);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );
  const [reviews, setReviews] = useState<WeeklyReviewRecordDto[]>([]);
  const [snapshots, setSnapshots] = useState<WorkspaceSnapshotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useReportRouteReady(!loading && !error);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const timezone = session.organization.timezone ?? "UTC";

  useEffect(() => {
    let recovered: LiveDraftEnvelope<WeeklyReviewDraft> | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isLiveDraftEnvelope(parsed, isWeeklyReviewDraft)) {
          recovered = parsed;
        }
      }
    } catch {
      // Draft recovery is best effort and never replaces server records.
    }
    const timer = window.setTimeout(() => {
      if (recovered) {
        setDraft(recovered.payload);
        setIdempotencyKey(recovered.idempotencyKey);
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    const envelope: LiveDraftEnvelope<WeeklyReviewDraft> = {
      version: 1,
      idempotencyKey,
      payload: draft,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(envelope));
    } catch {
      // The form remains usable without recoverable browser draft storage.
    }
  }, [draft, hydrated, idempotencyKey, storageKey]);

  useEffect(() => {
    let active = true;
    Promise.all([
      liveData.client.weeklyReviews(workspaceId),
      liveData.client.workspaceSnapshots({ workspaceId }),
    ])
      .then(([nextReviews, nextSnapshots]) => {
        if (!active) return;
        setReviews(nextReviews);
        setSnapshots(nextSnapshots);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [liveData.client, workspaceId]);

  function edit(patch: Partial<WeeklyReviewDraft>) {
    const next = { ...draft, ...patch };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      weeklyReviewFingerprint(next) !== draft.attemptedFingerprint;
    setDraft({
      ...next,
      ...(changedAfterAttempt ? { attemptedFingerprint: "" } : {}),
    });
    if (error || changedAfterAttempt) {
      setError(null);
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hydrated || pending) return;
    const attemptedFingerprint = weeklyReviewFingerprint(draft);
    const attemptedDraft = { ...draft, attemptedFingerprint };
    setDraft(attemptedDraft);
    persistWeeklyReviewDraft(storageKey, attemptedDraft, idempotencyKey);
    setPending(true);
    setError(null);
    try {
      const response = await liveData.client.submitWeeklyReview(
        {
          workspaceId,
          health: draft.health,
          progress: draft.progress,
          blocker: draft.blocker,
          nextMilestone: draft.nextMilestone,
          ...(draft.decisionNeeded
            ? { decisionNeeded: draft.decisionNeeded }
            : {}),
          priorityNextWeek: draft.priorityNextWeek,
        },
        idempotencyKey,
      );
      setConfirmed(
        `Server confirmed review ${response.data.update.id} and snapshot ${response.data.snapshot.id}.${response.replayed ? " The original idempotent result was replayed." : ""}`,
      );
      setReviews(await liveData.client.weeklyReviews(workspaceId));
      setSnapshots(await liveData.client.workspaceSnapshots({ workspaceId }));
      await liveData.refresh();
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        /* server is canonical */
      }
      setDraft(emptyReview);
      setIdempotencyKey(crypto.randomUUID());
    } catch (reason) {
      setError(reason);
    } finally {
      setPending(false);
    }
  }

  const presented = error ? presentLiveError(error) : null;
  return (
    <div className={styles.twoColumns}>
      <form
        className={styles.panel}
        data-testid="weekly-review-form"
        onSubmit={submit}
      >
        <header>
          <div>
            <p>Durable ritual</p>
            <h2>Publish weekly review</h2>
          </div>
        </header>
        {presented ? (
          <LiveStateNotice
            description={`${presented.description} Your organization-scoped draft is preserved.`}
            kind={presented.kind}
            title={presented.title}
          />
        ) : pending ? (
          <LiveStateNotice
            description="The review and snapshot must commit together before success appears."
            kind="pending"
            title="Waiting for server confirmation"
          />
        ) : confirmed ? (
          <LiveStateNotice
            description={confirmed}
            kind="saved"
            title="Weekly review is durable"
          />
        ) : null}
        <fieldset
          aria-busy={!hydrated || pending}
          className={styles.formBody}
          disabled={!hydrated || pending}
        >
          <label className={styles.field}>
            <span>Health</span>
            <select
              value={draft.health}
              onChange={(event) =>
                edit({
                  health: event.target.value as WeeklyReviewDraft["health"],
                })
              }
            >
              <option value="on_track">On track</option>
              <option value="watch">Watch</option>
              <option value="critical">Critical</option>
              <option value="parked">Parked</option>
            </select>
          </label>
          {(
            [
              ["progress", "Progress this week"],
              ["blocker", "Current blocker"],
              ["nextMilestone", "Next milestone"],
              ["decisionNeeded", "Decision needed · Optional"],
              ["priorityNextWeek", "Priority next week"],
            ] as const
          ).map(([key, label]) => (
            <label className={styles.field} key={key}>
              <span>{label}</span>
              <textarea
                onChange={(event) => edit({ [key]: event.target.value })}
                required={key !== "decisionNeeded"}
                rows={2}
                value={draft[key]}
              />
            </label>
          ))}
          <button
            className="primary-button"
            data-testid="weekly-review-submit"
            disabled={!hydrated || pending}
            type="submit"
          >
            {pending
              ? "Waiting for confirmation…"
              : error
                ? "Retry same review"
                : "Publish review and snapshot"}
          </button>
        </fieldset>
      </form>
      <section
        className={styles.panel}
        aria-labelledby="review-history-title"
        data-testid="weekly-review-history"
      >
        <header>
          <div>
            <p>Persistent memory</p>
            <h2 id="review-history-title">Review history</h2>
          </div>
        </header>
        {loading ? (
          <LiveStateNotice kind="loading" title="Loading review history" />
        ) : reviews.length === 0 ? (
          <LiveStateNotice kind="empty" title="No weekly reviews yet" />
        ) : (
          <div className={styles.timeline}>
            {reviews.map((review) => (
              <article key={review.id}>
                <strong>
                  {review.author.name} ·{" "}
                  {review.health?.replaceAll("_", " ") ?? "No health"}
                </strong>
                <p>{review.progress}</p>
                <small>{formatLiveDate(review.publishedAt, timezone)}</small>
              </article>
            ))}
          </div>
        )}
        <h3>Snapshots</h3>
        <div className={styles.snapshotGrid} data-testid="workspace-snapshots">
          {snapshots.map((snapshot) => (
            <article key={snapshot.id}>
              <strong>{formatLiveDate(snapshot.capturedAt, timezone)}</strong>
              <span>{snapshot.health.replaceAll("_", " ")}</span>
              <small>
                {snapshot.openCount} open · {snapshot.blockedCount} blocked ·{" "}
                {snapshot.attentionCount} attention
              </small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function isWeeklyReviewDraft(value: unknown): value is WeeklyReviewDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<WeeklyReviewDraft>;
  return (
    ["on_track", "watch", "critical", "parked"].includes(draft.health ?? "") &&
    typeof draft.progress === "string" &&
    typeof draft.blocker === "string" &&
    typeof draft.nextMilestone === "string" &&
    typeof draft.decisionNeeded === "string" &&
    typeof draft.priorityNextWeek === "string" &&
    typeof draft.attemptedFingerprint === "string"
  );
}

function weeklyReviewFingerprint(draft: WeeklyReviewDraft) {
  return JSON.stringify({
    health: draft.health,
    progress: draft.progress,
    blocker: draft.blocker,
    nextMilestone: draft.nextMilestone,
    decisionNeeded: draft.decisionNeeded,
    priorityNextWeek: draft.priorityNextWeek,
  });
}

function persistWeeklyReviewDraft(
  key: string,
  draft: WeeklyReviewDraft,
  idempotencyKey: string,
) {
  const envelope: LiveDraftEnvelope<WeeklyReviewDraft> = {
    version: 1,
    idempotencyKey,
    payload: draft,
    updatedAt: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // The in-memory review remains available for retry.
  }
}
