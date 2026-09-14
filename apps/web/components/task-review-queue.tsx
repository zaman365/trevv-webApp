"use client";
import { useState } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { taskHref } from "@/lib/workspace-routes";
import { AppLink as Link } from "@/components/navigation-link";
import { LiveWeeklyReview } from "./live-work-reviews";
import { reviewStateLabel } from "./task-review-panel";
import styles from "./task-page.module.css";

export function TaskReviewQueue({ workspaceId }: { workspaceId: string }) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const [filter, setFilter] = useState("mine");
  const workspace = data.workspaces.find((entry) => entry.id === workspaceId);
  const tasks = data.accessLost
    ? []
    : data.items.filter(
        (item) => item.workspaceId === workspaceId && item.review,
      );
  const visible = tasks.filter(
    (item) =>
      filter === "all" ||
      (filter === "sent"
        ? item.review!.requestedBy.id === session.user.id
        : ["pending", "changes_requested"].includes(item.review!.state) &&
          item.review!.reviewers.some(
            (person) =>
              person.id === session.user.id && person.decision === "pending",
          )),
  );
  return (
    <div className={styles.stack}>
      <nav className={styles.tabs} aria-label="Review views">
        {[
          ["mine", "Reviews for me"],
          ["sent", "Requested by me"],
          ["all", "All task reviews"],
          ["weekly", "Weekly review"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-current={filter === id ? "page" : undefined}
            onClick={() => setFilter(id!)}
          >
            {label}
          </button>
        ))}
      </nav>
      {filter === "weekly" ? (
        <LiveWeeklyReview workspaceId={workspaceId} />
      ) : (
        <>
          <h2>Task reviews</h2>
          <p className={styles.muted}>
            Review the work, leave feedback and track each person's response.
          </p>
          {!data.recordsComplete && (
            <p role="status">Loading the remaining tasks…</p>
          )}
          {data.error ? (
            <p role="alert">
              Reviews could not be refreshed.{" "}
              <button type="button" onClick={() => void data.refresh()}>
                Retry
              </button>
            </p>
          ) : null}
          {visible.length === 0 && data.recordsComplete && !data.error ? (
            <section className={styles.panel}>
              <h3>No reviews here yet</h3>
              <p>Open a task and choose Send for review to request feedback.</p>
            </section>
          ) : null}
          {workspace &&
            visible.map((item) => (
              <Link
                key={item.id}
                href={`${taskHref(workspace.slug, item.id)}#reviews`}
                className={styles.panel}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className={styles.panelHeading}>
                  <h3>{item.title}</h3>
                  <span className={styles.badge}>
                    {reviewStateLabel[item.review!.state]}
                  </span>
                </div>
                <p className={styles.muted}>
                  Round {item.review!.round} · {item.review!.requestedBy.name} ·{" "}
                  {
                    item.review!.reviewers.filter(
                      (person) => person.decision !== "pending",
                    ).length
                  }
                  /{item.review!.reviewers.length} responses
                  {item.review!.dueDate ? ` · Due ${item.review!.dueDate}` : ""}
                </p>
                <p>{item.review!.note.slice(0, 240)}</p>
                <span>Open task review →</span>
              </Link>
            ))}
        </>
      )}
    </div>
  );
}
