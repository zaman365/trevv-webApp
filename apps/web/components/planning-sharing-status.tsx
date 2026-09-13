"use client";

import type { WorkspaceDto } from "@founderhq/api-contract";
import type { ShareJob } from "@/lib/planning-sharing";
import { AppLink as Link } from "@/components/navigation-link";
import { workspaceHref } from "@/lib/workspace-routes";
import styles from "./planning-sharing-status.module.css";

export function PlanningSharingStatus({
  jobs,
  pending,
  errors,
  workspaces,
  onRetry,
  onDismiss,
}: {
  jobs: ShareJob[];
  pending: string[];
  errors: Record<string, string>;
  workspaces: WorkspaceDto[];
  onRetry: (job: ShareJob) => void;
  onDismiss: (key: string) => void;
}) {
  return (
    <aside
      className={styles.tray}
      aria-label="Plan and idea sharing"
      aria-live="polite"
    >
      {jobs.map((job) => {
        const workspace = workspaces.find(
          (entry) => entry.id === job.input.workspaceId,
        );
        if (!workspace) return null;
        const busy = pending.includes(job.key);
        return (
          <div key={job.key} className={styles.shareStatus}>
            <strong>{job.title}</strong>
            <p>
              {job.roomId
                ? "Shared with your selected people. The discussion is ready."
                : busy
                  ? "Saved. Sharing with your selected people…"
                  : "Saved. Sharing has not been confirmed; retry without creating another plan or idea."}
            </p>
            {errors[job.key] ? <p role="alert">{errors[job.key]}</p> : null}
            <div className={styles.actions}>
              {job.roomId ? (
                <Link
                  href={`${workspaceHref(workspace.slug, "messages")}#${encodeURIComponent(job.roomId)}`}
                  onClick={() => onDismiss(job.key)}
                >
                  Open discussion
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRetry(job)}
                >
                  Retry sharing
                </button>
              )}
              {job.roomId ? (
                <button
                  type="button"
                  aria-label={`Dismiss sharing confirmation for ${job.title}`}
                  onClick={() => onDismiss(job.key)}
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </aside>
  );
}
