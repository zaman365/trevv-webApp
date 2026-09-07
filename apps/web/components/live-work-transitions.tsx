"use client";

import { useReportRouteReady } from "@/lib/navigation-performance";

import type { WorkItemDto } from "@founderhq/api-contract";
import { CheckCircle2, FileQuestion } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords as useLiveAppData } from "@/lib/live-app-data";
import { presentLiveError } from "@/lib/live-errors";
import {
  isLiveDraftEnvelope,
  liveDraftStorageKey,
  type LiveDraftEnvelope,
} from "@/lib/live-workflow-ui";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
import { WindowedCollection } from "./windowed-collection";
import { recordKey } from "@/lib/live-work-view-helpers";

interface TransitionDraft {
  state: string;
  rationale: string;
  evidence: string;
  idempotencyKey: string;
  attemptedFingerprint: string;
  attemptedVersion: number | null;
}

export function LiveTransitions({
  items: source,
  kind,
  workspaceId,
}: {
  items: WorkItemDto[];
  kind: "decision" | "approval";
  workspaceId: string;
}) {
  useReportRouteReady(true);
  const session = useAppSession();
  const liveData = useLiveAppData();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope: `${kind}-transitions:${workspaceId}`,
  });
  const [items, setItems] = useState(source);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, TransitionDraft>>({});
  const [notice, setNotice] = useState<ReactNode>(null);
  const [conflict, setConflict] = useState<{
    itemId: string;
    error: unknown;
  } | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let recovered: Record<string, TransitionDraft> | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isLiveDraftEnvelope(parsed, isTransitionDraftMap))
          recovered = parsed.payload;
      }
    } catch {
      // Recovery is best effort; server records remain canonical.
    }
    const timer = window.setTimeout(() => {
      if (recovered) setDrafts(recovered);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    persistTransitionDrafts(storageKey, drafts);
  }, [drafts, hydrated, storageKey]);

  useEffect(() => {
    if (pendingId) return;
    const timer = window.setTimeout(() => setItems(source), 0);
    return () => window.clearTimeout(timer);
  }, [pendingId, source]);

  function editDraft(
    itemId: string,
    draft: TransitionDraft,
    patch: Partial<Pick<TransitionDraft, "state" | "rationale" | "evidence">>,
  ) {
    const next = { ...draft, ...patch };
    const changedAfterAttempt =
      Boolean(draft.attemptedFingerprint) &&
      transitionPayloadFingerprint(next) !==
        transitionPayloadFingerprint(draft);
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...next,
        idempotencyKey:
          changedAfterAttempt || !next.idempotencyKey
            ? crypto.randomUUID()
            : next.idempotencyKey,
        ...(changedAfterAttempt
          ? { attemptedFingerprint: "", attemptedVersion: null }
          : {}),
      },
    }));
    if (changedAfterAttempt) {
      setNotice(null);
      setConflict(null);
    }
  }

  async function transition(item: WorkItemDto, reapplyToLatest = false) {
    const recovered = drafts[item.id] ?? emptyTransitionDraft(kind);
    const draft = reapplyToLatest
      ? {
          ...recovered,
          idempotencyKey: crypto.randomUUID(),
          attemptedFingerprint: "",
          attemptedVersion: null,
        }
      : recovered;
    if (!draft.rationale.trim()) return;
    const expectedVersion = draft.attemptedVersion ?? item.version;
    const fingerprint = transitionAttemptFingerprint(
      kind,
      item.id,
      expectedVersion,
      draft,
    );
    const idempotencyKey = draft.idempotencyKey || crypto.randomUUID();
    const attemptedDraft: TransitionDraft = {
      ...draft,
      idempotencyKey,
      attemptedFingerprint: fingerprint,
      attemptedVersion: expectedVersion,
    };
    const attemptedDrafts = { ...drafts, [item.id]: attemptedDraft };
    setDrafts(attemptedDrafts);
    persistTransitionDrafts(storageKey, attemptedDrafts);
    setPendingId(item.id);
    setNotice(null);
    setConflict(null);
    try {
      const response =
        kind === "decision"
          ? await liveData.client.transitionDecision(
              item.id,
              {
                state: attemptedDraft.state as NonNullable<
                  WorkItemDto["decisionState"]
                >,
                rationale: attemptedDraft.rationale,
                ...(attemptedDraft.evidence.trim()
                  ? { evidence: attemptedDraft.evidence }
                  : {}),
              },
              expectedVersion,
              idempotencyKey,
            )
          : await liveData.client.transitionApproval(
              item.id,
              {
                state: attemptedDraft.state as NonNullable<
                  WorkItemDto["approvalState"]
                >,
                rationale: attemptedDraft.rationale,
                ...(attemptedDraft.evidence.trim()
                  ? { evidence: attemptedDraft.evidence }
                  : {}),
              },
              expectedVersion,
              idempotencyKey,
            );
      await liveData.applyConfirmedItem(response.data.item);
      setItems((current) =>
        current.map((record) =>
          record.id === response.data.item.id ? response.data.item : record,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      clearTransitionDraft(storageKey, item.id);
      setNotice(
        <LiveStateNotice
          description={`Version ${response.data.item.version}, rationale${response.data.evidence ? ", and evidence" : ""} are canonical. Attention recomputation ${response.data.attentionRefreshQueued ? "is queued" : "was not required"}.`}
          kind="saved"
          title={`Server confirmed ${kind} transition`}
        />,
      );
      await liveData.refresh({ backgroundRecords: true });
    } catch (reason) {
      const presented = presentLiveError(reason);
      if (presented.kind === "version-conflict") {
        setConflict({ itemId: item.id, error: reason });
      } else {
        setNotice(
          <LiveStateNotice
            description={`${presented.description} Your rationale, evidence, and safe retry key remain recoverable for this account and organization.`}
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
    <section className={styles.panel} aria-labelledby={`${kind}-items-title`}>
      <header>
        <div>
          <p>Canonical record + accountable rationale</p>
          <h2 id={`${kind}-items-title`}>
            {kind === "decision" ? "Decision" : "Approval"} WorkItems
          </h2>
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
                    const latest = await liveData.client.item(conflict.itemId);
                    setItems((current) =>
                      current.map((item) =>
                        item.id === latest.id ? latest : item,
                      ),
                    );
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
                    const latest = await liveData.client.item(current.itemId);
                    setConflict(null);
                    await transition(latest, true);
                  })()
                }
                type="button"
              >
                Reapply to latest
              </button>
            </>
          }
          description={`${presentLiveError(conflict.error).description} Your rationale and evidence remain recoverable until you load or reapply the latest version.`}
          kind="version-conflict"
          title="Choose how to handle the newer WorkItem"
        />
      ) : null}
      {items.length === 0 ? (
        <LiveStateNotice
          description={
            liveData.recordsComplete
              ? `Create a ${kind} WorkItem on a board to begin.`
              : "More workspace records are still arriving."
          }
          kind={liveData.recordsComplete ? "empty" : "loading"}
          title={
            liveData.recordsComplete ? `No ${kind}s yet` : `Loading ${kind}s`
          }
        />
      ) : (
        <WindowedCollection
          className={styles.stack}
          items={items}
          itemKey={recordKey}
          label="Work records"
        >
          {(item) => {
            const draft = drafts[item.id] ?? emptyTransitionDraft(kind);
            const states =
              kind === "decision"
                ? ([
                    "needed",
                    "analyzing",
                    "delegated",
                    "deferred",
                    "decided",
                  ] as const)
                : ([
                    "pending",
                    "changes_requested",
                    "approved",
                    "rejected",
                  ] as const);
            return (
              <article className={styles.transitionCard} key={item.id}>
                <span className={styles.rowIcon}>
                  {kind === "decision" ? (
                    <FileQuestion size={16} />
                  ) : (
                    <CheckCircle2 size={16} />
                  )}
                </span>
                <div>
                  <p>
                    v{item.version} ·{" "}
                    {kind === "decision"
                      ? item.decisionState
                      : item.approvalState}
                  </p>
                  <h3>{item.title}</h3>
                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Outcome state</span>
                      <select
                        disabled={!hydrated || pendingId === item.id}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            state: event.target.value,
                          })
                        }
                        value={draft.state}
                      >
                        {states.map((state) => (
                          <option key={state} value={state}>
                            {state.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Rationale</span>
                      <textarea
                        disabled={!hydrated || pendingId === item.id}
                        maxLength={5_000}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            rationale: event.target.value,
                          })
                        }
                        required
                        rows={2}
                        value={draft.rationale}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Evidence · Optional</span>
                      <textarea
                        disabled={!hydrated || pendingId === item.id}
                        maxLength={5_000}
                        onChange={(event) =>
                          editDraft(item.id, draft, {
                            evidence: event.target.value,
                          })
                        }
                        rows={2}
                        value={draft.evidence}
                      />
                    </label>
                  </div>
                </div>
                <button
                  data-testid={`${kind}-transition-${item.id}`}
                  disabled={
                    !hydrated ||
                    pendingId === item.id ||
                    !draft.rationale.trim()
                  }
                  onClick={() => void transition(item)}
                  type="button"
                >
                  {pendingId === item.id ? "Saving…" : "Record outcome"}
                </button>
              </article>
            );
          }}
        </WindowedCollection>
      )}
    </section>
  );
}

function emptyTransitionDraft(kind: "decision" | "approval"): TransitionDraft {
  return {
    state: kind === "decision" ? "decided" : "approved",
    rationale: "",
    evidence: "",
    idempotencyKey: "",
    attemptedFingerprint: "",
    attemptedVersion: null,
  };
}

function transitionPayloadFingerprint(draft: TransitionDraft) {
  return JSON.stringify({
    state: draft.state,
    rationale: draft.rationale,
    evidence: draft.evidence,
  });
}

function transitionAttemptFingerprint(
  kind: "decision" | "approval",
  itemId: string,
  expectedVersion: number,
  draft: TransitionDraft,
) {
  return JSON.stringify({
    kind,
    itemId,
    expectedVersion,
    payload: JSON.parse(transitionPayloadFingerprint(draft)) as unknown,
  });
}

function isTransitionDraftMap(
  value: unknown,
): value is Record<string, TransitionDraft> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 500) return false;
  return entries.every(([itemId, candidate]) => {
    if (
      !itemId ||
      !candidate ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    )
      return false;
    const draft = candidate as Partial<TransitionDraft>;
    return (
      typeof draft.state === "string" &&
      draft.state.length <= 64 &&
      typeof draft.rationale === "string" &&
      draft.rationale.length <= 5_000 &&
      typeof draft.evidence === "string" &&
      draft.evidence.length <= 5_000 &&
      typeof draft.idempotencyKey === "string" &&
      typeof draft.attemptedFingerprint === "string" &&
      (draft.attemptedVersion === null ||
        (Number.isInteger(draft.attemptedVersion) &&
          (draft.attemptedVersion ?? -1) >= 0))
    );
  });
}

function persistTransitionDrafts(
  storageKey: string,
  drafts: Record<string, TransitionDraft>,
) {
  try {
    if (Object.keys(drafts).length === 0) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    const envelope: LiveDraftEnvelope<Record<string, TransitionDraft>> = {
      version: 1,
      idempotencyKey: crypto.randomUUID(),
      payload: drafts,
      updatedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(storageKey, JSON.stringify(envelope));
  } catch {
    // In-memory input remains usable when draft storage is unavailable.
  }
}

function clearTransitionDraft(storageKey: string, itemId: string) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return;
    const parsed: unknown = JSON.parse(stored);
    if (!isLiveDraftEnvelope(parsed, isTransitionDraftMap)) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    const next = { ...parsed.payload };
    delete next[itemId];
    persistTransitionDrafts(storageKey, next);
  } catch {
    // The acknowledged server transition is canonical even if cleanup fails.
  }
}
