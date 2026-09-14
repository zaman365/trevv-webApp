"use client";
import type { FormEvent } from "react";
import type { WorkspaceDto } from "@founderhq/api-contract";
import type { presentLiveError } from "@/lib/live-errors";
import { CheckCircle2, FolderKanban, X } from "lucide-react";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";
type WorkspaceType = WorkspaceDto["type"];

/** Form state stays in the portfolio so closing this surface retains the draft. */
export function LivePortfolioCreateForm({
  portfolioName,
  name,
  type,
  priority,
  pending,
  error,
  presentedError,
  editForm,
  setName,
  setType,
  setPriority,
  onClose,
  createWorkspace,
}: {
  portfolioName: string;
  name: string;
  type: WorkspaceType;
  priority: string;
  pending: boolean;
  error: unknown;
  presentedError: ReturnType<typeof presentLiveError> | null;
  editForm: () => void;
  setName: (value: string) => void;
  setType: (value: WorkspaceType) => void;
  setPriority: (value: string) => void;
  onClose: () => void;
  createWorkspace: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <div className="dialog-layer" onMouseDown={onClose} role="presentation">
      <form
        aria-labelledby="live-workspace-create-title"
        aria-modal="true"
        className={`capture-dialog ${styles.smallDialog}`}
        data-testid="create-workspace-dialog"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={createWorkspace}
        role="dialog"
      >
        <header>
          <span className="attention-icon">
            <FolderKanban size={17} />
          </span>
          <div>
            <h2 id="live-workspace-create-title">
              Create a project or workspace
            </h2>
            <p>Creates it together with its first plan board.</p>
          </div>
          <button
            aria-label="Close workspace creation"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </header>
        <div className={styles.formBody}>
          {presentedError ? (
            <LiveStateNotice
              description={presentedError.description}
              kind={presentedError.kind}
              title={presentedError.title}
            />
          ) : pending ? (
            <LiveStateNotice
              description="TREVV will only show success after the server commits the workspace and first plan."
              kind="pending"
              title="Creating workspace and first plan"
            />
          ) : null}
          <label className={styles.field}>
            <span>Name</span>
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => {
                editForm();
                setName(event.target.value);
              }}
              required
              value={name}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Type</span>
              <select
                onChange={(event) => {
                  editForm();
                  setType(event.target.value as WorkspaceType);
                }}
                value={type}
              >
                {(
                  [
                    "business",
                    "client",
                    "product",
                    "venture",
                    "initiative",
                    "project",
                    "department",
                    "shared_function",
                  ] as const
                ).map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {candidate === "venture"
                      ? "startup / venture"
                      : candidate.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Current priority</span>
              <input
                maxLength={500}
                onChange={(event) => {
                  editForm();
                  setPriority(event.target.value);
                }}
                value={priority}
              />
            </label>
          </div>
        </div>
        <footer>
          <span>Portfolio: {portfolioName}</span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={pending || name.trim().length < 2}
              type="submit"
            >
              {pending ? (
                "Waiting for confirmation…"
              ) : error ? (
                "Retry same request"
              ) : (
                <>
                  <CheckCircle2 size={14} /> Create Workspace
                </>
              )}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
