"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  taskReviewSchema,
  type TaskReviewCommandInput,
  type TaskReviewDto,
  type WorkItemDto,
  type WorkItemHistoryEntryDto,
} from "@founderhq/api-contract";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { formatLiveDate, formatLiveDateOnly } from "@/lib/live-workflow-ui";
import { presentLiveError } from "@/lib/live-errors";
import { LiveStateNotice } from "./live-state";
import styles from "./task-page.module.css";

export const reviewStateLabel = {
  pending: "Awaiting responses",
  approved: "Approved",
  changes_requested: "Changes requested",
  cancelled: "Cancelled",
  invalidated: "New review needed",
};

export function TaskReviewPanel({
  item,
  history,
  onConfirmed,
}: {
  item: WorkItemDto;
  history: WorkItemHistoryEntryDto[];
  onConfirmed: (item: WorkItemDto, message: string) => Promise<void>;
}) {
  const session = useAppSession();
  const { client } = useLiveAppRecords();
  const timezone = session.organization.timezone ?? "UTC";
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [responseNote, setResponseNote] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const guard = useRef(false);
  const keys = useRef(new Map<string, string>());
  const directory = useQuery({
    queryKey: [
      "workspace-resources",
      session.organization.id,
      item.workspaceId,
      "assignees",
    ],
    queryFn: ({ signal }) =>
      client.withSignal(signal).teamDirectory(item.workspaceId),
    staleTime: 30_000,
  });
  const current = item.review;
  const mine = current?.reviewers.find(
    (person) => person.id === session.user.id,
  );
  const active =
    current &&
    ["pending", "changes_requested", "invalidated"].includes(current.state);
  const editable = item.status !== "done" && item.status !== "blocked";
  const canCancel =
    current?.requestedBy.id === session.user.id ||
    item.assignees.some((person) => person.id === session.user.id) ||
    ["owner", "admin"].includes(session.organization.role) ||
    session.managedWorkspaceIds.includes(item.workspaceId);
  const rounds = new Map<string, TaskReviewDto>();
  for (const entry of history) {
    const parsed = taskReviewSchema.safeParse(entry.metadata.review);
    if (parsed.success) rounds.set(parsed.data.id, parsed.data);
  }
  if (current) rounds.set(current.id, current);
  async function submit(command: TaskReviewCommandInput) {
    if (guard.current) return;
    guard.current = true;
    setPending(true);
    setError(null);
    const fingerprint = JSON.stringify([item.id, item.version, command]);
    if (!keys.current.has(fingerprint))
      keys.current.set(fingerprint, crypto.randomUUID());
    try {
      const response = await client.reviewTask(
        item.id,
        command,
        item.version,
        keys.current.get(fingerprint)!,
      );
      await onConfirmed(
        response.data,
        command.action === "request"
          ? "Review sent. Each reviewer can find it in Reviews for me."
          : "Review response saved.",
      );
      if (command.action === "request") {
        setNote("");
        setReviewerIds([]);
      } else setResponseNote("");
    } catch (failure) {
      setError(failure);
    } finally {
      guard.current = false;
      setPending(false);
    }
  }
  const problem = error ? presentLiveError(error) : null;
  return (
    <div className={styles.stack}>
      {problem && (
        <LiveStateNotice
          {...problem}
          actions={
            <button
              type="button"
              onClick={() =>
                void client
                  .item(item.id)
                  .then((latest) =>
                    onConfirmed(
                      latest,
                      "Latest task loaded. Your notes are kept.",
                    ),
                  )
                  .catch(setError)
              }
            >
              Load latest task
            </button>
          }
        />
      )}
      <section className={styles.panel}>
        <h2>Send for review</h2>
        <p className={styles.muted}>
          Choose the people who should review this work and explain what needs
          checking. Everyone must approve before completion. Notes can include
          links to results or external files.
        </p>
        {!editable ? (
          <p>Reopen or unblock this task before requesting a review.</p>
        ) : current?.state === "pending" ? (
          <p>A review is already in progress. Follow the responses below.</p>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit({
                action: "request",
                reviewerIds,
                note,
                ...(dueDate ? { dueDate } : {}),
              });
            }}
            className={styles.stack}
          >
            <fieldset
              disabled={
                pending || directory.isPending || Boolean(directory.error)
              }
              className={styles.reviewers}
            >
              <legend>
                Reviewers{" "}
                <span className={styles.muted}>
                  · {reviewerIds.length} selected
                </span>
              </legend>
              {(directory.data?.availableMembers ?? []).map((person) => (
                <label key={person.id}>
                  <input
                    type="checkbox"
                    disabled={
                      reviewerIds.length >= 25 &&
                      !reviewerIds.includes(person.id)
                    }
                    checked={reviewerIds.includes(person.id)}
                    onChange={(event) =>
                      setReviewerIds((ids) =>
                        event.target.checked
                          ? [...ids, person.id]
                          : ids.filter((id) => id !== person.id),
                      )
                    }
                  />
                  <span>
                    {person.name}
                    {person.id === session.user.id ? " (you)" : ""}
                  </span>
                </label>
              ))}
            </fieldset>
            {directory.error ? (
              <p role="alert">
                Reviewers could not be loaded.{" "}
                <button type="button" onClick={() => void directory.refetch()}>
                  Retry
                </button>
              </p>
            ) : null}
            <label>
              Review notes
              <textarea
                required
                maxLength={5000}
                value={note}
                disabled={pending}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What changed? What should reviewers check? Include result or Google Drive URLs."
              />
            </label>
            <label className={styles.dateField}>
              Review due <span className={styles.muted}>· Optional</span>
              <input
                type="date"
                value={dueDate}
                disabled={pending}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </label>
            <div className={styles.actions}>
              <button
                className={styles.primary}
                disabled={
                  pending ||
                  !reviewerIds.length ||
                  Boolean(directory.error) ||
                  directory.isPending ||
                  !note.trim()
                }
                type="submit"
              >
                {pending
                  ? "Sending…"
                  : current
                    ? "Send new review round"
                    : "Send for review"}
              </button>
            </div>
          </form>
        )}
      </section>
      {[...rounds.values()]
        .sort((a, b) => b.round - a.round)
        .map((round) => (
          <section
            className={styles.panel}
            key={round.id}
            aria-label={`Review round ${round.round}`}
          >
            <header className={styles.panelHeading}>
              <h2>Round {round.round}</h2>
              <span className={styles.badge} data-state={round.state}>
                {reviewStateLabel[round.state]}
              </span>
            </header>
            <p className={styles.muted}>
              Requested by {round.requestedBy.name} ·{" "}
              {formatLiveDate(round.requestedAt, timezone)}
              {round.dueDate
                ? ` · Due ${formatLiveDateOnly(round.dueDate, timezone)}`
                : ""}
            </p>
            <TaskText text={round.note} />
            <ul className={styles.responses}>
              {round.reviewers.map((person) => (
                <li key={person.id}>
                  <div className={styles.panelHeading}>
                    <strong>{person.name}</strong>
                    <span className={styles.badge}>
                      {person.decision === "pending"
                        ? "Awaiting response"
                        : reviewStateLabel[person.decision]}
                    </span>
                  </div>
                  {person.note && <TaskText text={person.note} />}
                  {person.respondedAt && (
                    <small className={styles.muted}>
                      {formatLiveDate(person.respondedAt, timezone)}
                    </small>
                  )}
                </li>
              ))}
            </ul>
            {round.closingNote && (
              <p className={styles.muted}>{round.closingNote}</p>
            )}
            {round.id === current?.id &&
            active &&
            editable &&
            ((mine?.decision === "pending" &&
              current.state !== "invalidated") ||
              canCancel) ? (
              <div className={styles.stack}>
                <label>
                  {mine?.decision === "pending"
                    ? "Your review notes"
                    : "Cancellation note"}
                  <textarea
                    value={responseNote}
                    maxLength={5000}
                    disabled={pending}
                    onChange={(event) => setResponseNote(event.target.value)}
                    placeholder="Explain your decision and any changes needed."
                  />
                </label>
                <div className={styles.actions}>
                  {mine?.decision === "pending" &&
                    current?.state !== "invalidated" && (
                      <>
                        <button
                          className={styles.primary}
                          type="button"
                          disabled={pending || !responseNote.trim()}
                          onClick={() =>
                            void submit({
                              action: "respond",
                              roundId: round.id,
                              decision: "approved",
                              note: responseNote,
                            })
                          }
                        >
                          Approve work
                        </button>
                        <button
                          type="button"
                          disabled={pending || !responseNote.trim()}
                          onClick={() =>
                            void submit({
                              action: "respond",
                              roundId: round.id,
                              decision: "changes_requested",
                              note: responseNote,
                            })
                          }
                        >
                          Request changes
                        </button>
                      </>
                    )}
                  {canCancel && (
                    <button
                      type="button"
                      disabled={pending || !responseNote.trim()}
                      onClick={() =>
                        void submit({
                          action: "cancel",
                          roundId: round.id,
                          note: responseNote,
                        })
                      }
                    >
                      Cancel review
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </section>
        ))}
    </div>
  );
}

/** Render only explicit HTTP(S) references; other content remains plain text. */
export function TaskText({ text }: { text: string }) {
  return (
    <p className={styles.text}>
      {text.split(/(https?:\/\/[^\s<>]+)/g).map((part, index) =>
        /^https?:\/\//.test(part) ? (
          <a key={index} href={part} target="_blank" rel="noopener noreferrer">
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}
