"use client";

import { CheckCircle2, LayoutList, X } from "lucide-react";
import type { FormEvent } from "react";
import type { PeopleChoice } from "@/lib/planning-sharing";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import { presentLiveError } from "@/lib/live-errors";
import { PlanningPeopleFields } from "./planning-people-fields";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

type PlanDraft = {
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  teamId: string;
  people: PeopleChoice;
};

export function LiveDashboardPlanDialog({
  workspaceId,
  workspaceName,
  draft,
  onChange,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  workspaceId: string;
  workspaceName: string;
  draft: PlanDraft;
  onChange: (next: Partial<PlanDraft>) => void;
  pending: boolean;
  error: unknown;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const dialog = useAccessibleDialog<HTMLFormElement>(onClose);
  const presentedError = error ? presentLiveError(error) : null;
  return (
    <div
      className={`dialog-layer ${styles.dialogLayer}`}
      onMouseDown={onClose}
      role="presentation"
    >
      <form
        aria-labelledby="live-board-create-title"
        aria-modal="true"
        className={`capture-dialog ${styles.captureDialog} ${styles.smallDialog}`}
        data-testid="create-board-dialog"
        ref={dialog}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={onSubmit}
        role="dialog"
      >
        <header>
          <span className="attention-icon">
            <LayoutList size={17} />
          </span>
          <div>
            <h2 id="live-board-create-title">Create a plan</h2>
            <p>Organize tasks and milestones for {workspaceName}.</p>
          </div>
          <button
            aria-label="Close plan creation"
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
              description="Success appears only after the server commits the plan."
              kind="pending"
              title="Waiting for server confirmation"
            />
          ) : null}
          <label className={styles.field}>
            <span>Plan name</span>
            <input
              autoFocus
              maxLength={160}
              onChange={(event) => onChange({ name: event.target.value })}
              required
              value={draft.name}
            />
          </label>
          <label className={styles.field}>
            <span>Description · Optional</span>
            <textarea
              maxLength={5000}
              onChange={(event) =>
                onChange({ description: event.target.value })
              }
              value={draft.description}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Start date · Optional</span>
              <input
                onChange={(event) =>
                  onChange({ startDate: event.target.value })
                }
                type="date"
                value={draft.startDate}
              />
            </label>
            <label className={styles.field}>
              <span>End date · Optional</span>
              <input
                min={draft.startDate || undefined}
                onChange={(event) => onChange({ endDate: event.target.value })}
                type="date"
                value={draft.endDate}
              />
            </label>
          </div>
          <PlanningPeopleFields
            workspaceId={workspaceId}
            teamId={draft.teamId}
            onTeamChange={(teamId) =>
              onChange({
                teamId,
                people: { ...draft.people, participantIds: [] },
              })
            }
            value={draft.people}
            onChange={(people) => onChange({ people })}
            disabled={pending}
          />
        </div>
        <footer>
          <span>
            {draft.people.enabled
              ? "Selected people will receive a shared discussion."
              : "Create now. Invite collaborators whenever you are ready."}
          </span>
          <div>
            <button onClick={onClose} type="button">
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={
                pending ||
                !draft.name.trim() ||
                (draft.people.enabled && !draft.people.participantIds.length)
              }
              type="submit"
            >
              {pending ? (
                "Waiting for confirmation…"
              ) : error ? (
                "Retry same request"
              ) : (
                <>
                  <CheckCircle2 size={14} /> Create plan
                </>
              )}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
