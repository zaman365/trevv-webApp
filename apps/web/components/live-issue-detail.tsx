"use client";

import {
  lazy,
  Suspense,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttentionAction,
  AttentionSignalDto,
  WorkItemDto,
  WorkspaceDto,
} from "@founderhq/api-contract";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  ListTodo,
  MessageCircleMore,
  Plus,
  X,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useAccessibleDialog } from "@/lib/live-collaboration";
import { useWorkItemDetails } from "@/lib/use-work-item-details";
import { isLiveAccessLoss, presentLiveReadError } from "@/lib/live-errors";
import { formatLiveDate, formatLiveDateOnly } from "@/lib/live-workflow-ui";
import {
  issueCategory,
  issueContext,
  issueHref,
  issueResolutionSection,
  issueWorkItemId,
  type IssueSection,
} from "@/lib/attention-workspace";
import { workspaceHref } from "@/lib/workspace-routes";
import { useIssueDraft } from "@/lib/use-issue-draft";
import { LiveStateNotice } from "./live-state";
import { LiveIssueCommunication } from "./live-issue-communication";
import styles from "./live-issue-detail.module.css";

const WorkItemDetail = lazy(() =>
  import("./live-board-experience").then((module) => ({
    default: module.WorkItemDetail,
  })),
);
const Capture = lazy(() =>
  import("./live-quick-capture").then((module) => ({
    default: module.LiveQuickCaptureDialog,
  })),
);
const WeeklyReview = lazy(() =>
  import("./live-work-reviews").then((module) => ({
    default: module.LiveWeeklyReview,
  })),
);
const Transitions = lazy(() =>
  import("./live-work-transitions").then((module) => ({
    default: module.LiveTransitions,
  })),
);
const Waiting = lazy(() =>
  import("./live-work-waiting").then((module) => ({
    default: module.LiveWaiting,
  })),
);

export function LiveIssueDetail({
  signal,
  workspace,
  initialSection,
  initialAction,
  active,
  pending,
  actionNotice,
  returnFocusRef,
  onClose,
  onAction,
}: {
  signal: AttentionSignalDto;
  workspace: WorkspaceDto;
  initialSection: IssueSection;
  initialAction?: AttentionAction["action"];
  active: boolean;
  pending: boolean;
  actionNotice: ReactNode;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onAction: (
    signal: AttentionSignalDto,
    input: AttentionAction,
  ) => Promise<boolean>;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const dialog = useAccessibleDialog(onClose, returnFocusRef);
  const [section, setSection] = useState<IssueSection>(initialSection);
  const [notice, setNotice] = useState("");
  const [createdLink, setCreatedLink] = useState("");
  const itemId = issueWorkItemId(signal);
  const itemKey = [
    "attention-item",
    session.organization.id,
    workspace.id,
    itemId,
  ];
  const itemQuery = useQuery({
    queryKey: itemKey,
    queryFn: ({ signal: abort }) => data.client.withSignal(abort).item(itemId!),
    enabled: Boolean(itemId),
    staleTime: 0,
    refetchInterval: 5_000,
  });
  const details = useWorkItemDetails(
    data.client,
    session.organization.id,
    workspace.id,
    itemId ?? null,
  );
  const itemAccessLost =
    isLiveAccessLoss(itemQuery.error) || isLiveAccessLoss(details.error);
  const item =
    !itemAccessLost && itemQuery.data?.workspaceId === workspace.id
      ? itemQuery.data
      : undefined;
  const url = `${typeof window === "undefined" ? "" : window.location.origin}${issueHref(workspace.slug, signal.id)}`;
  const canWrite =
    !["guest", "viewer"].includes(session.organization.role) &&
    !data.accessLost &&
    !itemAccessLost;
  const timezone = session.organization.timezone ?? "UTC";
  const {
    draft: actionDraft,
    setDraft: setActionDraft,
    hydrated,
  } = useIssueDraft(`issue-action:${signal.id}`, { reason: "" });
  const [chosenAction, setChosenAction] = useState<AttentionAction["action"]>(
    initialAction ?? "resolve",
  );
  const [actionsOpen, setActionsOpen] = useState(Boolean(initialAction));
  const [visited, setVisited] = useState<Set<IssueSection>>(
    () => new Set([initialSection]),
  );
  function go(next: IssueSection) {
    setSection(next);
    setVisited((current) => new Set([...current, next]));
  }
  const sections: [IssueSection, string][] = [
    ["overview", "Issue details"],
    ...(itemId
      ? [["work", "Task & resolution"] as [IssueSection, string]]
      : []),
    ["followup", "Follow-up task"],
    ["communication", "Communication"],
    ...(signal.reasonCode === "workspace.update_stale"
      ? [["update", "Workspace update"] as [IssueSection, string]]
      : []),
  ];
  async function savedItem(next: WorkItemDto, confirmation: string) {
    cache.setQueryData(itemKey, next);
    setNotice(confirmation);
    await data.applyConfirmedItem(next);
    void details.refetch();
    void data.refresh({ backgroundRecords: true });
  }
  const waiting = data.waiting.filter(
    (record) =>
      record.workspaceId === workspace.id && record.entityId === itemId,
  );
  if (itemAccessLost)
    return (
      <div className={styles.backdrop}>
        <div
          ref={dialog}
          className={styles.dialog}
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-unavailable-title"
          data-testid="issue-detail"
        >
          <header className={styles.header}>
            <h2 id="issue-unavailable-title">Issue source unavailable</h2>
            <button
              type="button"
              aria-label="Close issue details"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </header>
          <div className={styles.body}>
            <LiveStateNotice
              kind="permission-loss"
              title="The source task is no longer available"
              description="Your access may have changed. Refresh to check its current availability."
              actions={
                <button
                  type="button"
                  onClick={() => {
                    void itemQuery.refetch();
                    void details.refetch();
                  }}
                >
                  Check access again
                </button>
              }
            />
          </div>
        </div>
      </div>
    );
  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="issue-detail-title"
        ref={dialog}
        data-testid="issue-detail"
      >
        <header className={styles.header}>
          <div>
            <p>
              {workspace.name} · {issueCategory(signal)}
            </p>
            <h2 id="issue-detail-title">{signal.reason}</h2>
            <span className={styles.severity} data-severity={signal.severity}>
              {signal.severity} priority
            </span>
          </div>
          <button
            type="button"
            aria-label="Close issue details"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <nav className={styles.tabs} aria-label="Issue sections">
          {sections.map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-current={section === key ? "page" : undefined}
              onClick={() => go(key)}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className={styles.body}>
          {actionNotice}
          {notice ? <LiveStateNotice kind="saved" title={notice} /> : null}
          {!active ? (
            <LiveStateNotice
              kind="saved"
              title="This issue is no longer active"
              description="You can still review its context and the underlying work."
            />
          ) : null}
          <div hidden={section !== "overview"} className={styles.section}>
            <section className={styles.panel}>
              <h3>What needs to happen</h3>
              <p>
                {signal.recommendedAction ||
                  "Agree on a concrete next step and an accountable owner."}
              </p>
              <div className={styles.actions}>
                {canWrite ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={() => {
                      const next = issueResolutionSection(signal);
                      go(next === "overview" ? "followup" : next);
                    }}
                  >
                    <CheckCircle2 size={16} />
                    {itemId
                      ? "Work on a resolution"
                      : signal.reasonCode === "workspace.update_stale"
                        ? "Publish a workspace update"
                        : "Plan a follow-up"}
                  </button>
                ) : null}
                <button type="button" onClick={() => go("communication")}>
                  <MessageCircleMore size={16} />
                  Discuss or negotiate
                </button>
                {canWrite ? (
                  <button type="button" onClick={() => go("followup")}>
                    <Plus size={16} />
                    Create a follow-up task
                  </button>
                ) : null}
              </div>
              <p className={styles.hint}>
                Assigning work or sending a message does not close this issue.
                Address the cause first, then record the outcome.
              </p>
            </section>
            {itemQuery.error ? (
              <LiveStateNotice
                {...presentLiveReadError(itemQuery.error)}
                actions={
                  <button
                    type="button"
                    onClick={() => void itemQuery.refetch()}
                  >
                    Retry source task
                  </button>
                }
              />
            ) : null}
            {item ? (
              <section className={styles.panel}>
                <h3>Underlying task</h3>
                <button
                  type="button"
                  className={styles.sourceLink}
                  onClick={() => go("work")}
                >
                  <ListTodo size={17} />
                  {item.title}
                  <ArrowUpRight size={15} />
                </button>
                <p>{item.description || "No task description yet."}</p>
                <dl className={styles.facts}>
                  <div>
                    <dt>Owner</dt>
                    <dd>
                      {item.assignees.map((person) => person.name).join(", ") ||
                        "Unassigned"}
                    </dd>
                  </div>
                  <div>
                    <dt>Due</dt>
                    <dd>
                      {item.dueDate
                        ? formatLiveDateOnly(item.dueDate, timezone)
                        : "No due date"}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{item.status.replaceAll("_", " ")}</dd>
                  </div>
                </dl>
              </section>
            ) : itemId && itemQuery.isPending ? (
              <LiveStateNotice kind="loading" title="Loading the source task" />
            ) : null}
            <section className={styles.panel}>
              <h3>Why this issue appeared</h3>
              <p>{signal.reason}</p>
              <dl className={styles.facts}>
                <div>
                  <dt>First detected</dt>
                  <dd>{formatLiveDate(signal.createdAt, timezone)}</dd>
                </div>
                <div>
                  <dt>Last checked</dt>
                  <dd>{formatLiveDate(signal.computedAt, timezone)}</dd>
                </div>
                <div>
                  <dt>Impact / urgency</dt>
                  <dd>
                    {signal.impact} / 5 · {signal.urgency} / 5
                  </dd>
                </div>
              </dl>
              <ul className={styles.evidence}>
                {signal.sourceEvidence.map((source) => (
                  <li key={`${source.sourceType}:${source.sourceId}`}>
                    <strong>{source.summary || source.sourceType}</strong>
                    <time dateTime={source.capturedAt}>
                      {formatLiveDate(source.capturedAt, timezone)}
                    </time>
                    <details>
                      <summary>Source details</summary>
                      <dl>
                        <dt>Record</dt>
                        <dd>
                          {source.sourceType} · {source.sourceId}
                        </dd>
                      </dl>
                      {source.data ? (
                        <pre>{JSON.stringify(source.data, null, 2)}</pre>
                      ) : null}
                    </details>
                  </li>
                ))}
              </ul>
              <details>
                <summary>Detection details</summary>
                <dl>
                  <dt>Reason code</dt>
                  <dd>{signal.reasonCode}</dd>
                  <dt>Signal type</dt>
                  <dd>{signal.signalType}</dd>
                  <dt>Responsibility weight</dt>
                  <dd>{signal.responsibility}</dd>
                  <dt>Source fingerprint</dt>
                  <dd>{signal.sourceFingerprint}</dd>
                </dl>
                {Object.keys(signal.metadata).length ? (
                  <pre>{JSON.stringify(signal.metadata, null, 2)}</pre>
                ) : null}
              </details>
              {signal.actionReason ? (
                <p>Last action: {signal.actionReason}</p>
              ) : null}
            </section>
          </div>
          <Suspense
            fallback={
              <LiveStateNotice kind="loading" title="Loading issue tools" />
            }
          >
            <div hidden={section !== "work"} className={styles.section}>
              {visited.has("work") ? (
                item ? (
                  <>
                    <p>
                      Delegate ownership, agree a deadline, record evidence, or
                      complete the task. Its updates and history stay together.
                    </p>
                    {details.error ? (
                      <LiveStateNotice
                        {...presentLiveReadError(details.error)}
                        actions={
                          <button
                            type="button"
                            onClick={() => void details.refetch()}
                          >
                            Retry task history
                          </button>
                        }
                      />
                    ) : null}
                    {canWrite &&
                    (item.type === "decision" || item.type === "approval") ? (
                      <Transitions
                        items={[item]}
                        kind={item.type}
                        workspaceId={workspace.id}
                      />
                    ) : null}
                    {canWrite && waiting.length ? (
                      <Waiting records={waiting} />
                    ) : null}
                    {canWrite ? (
                      <WorkItemDetail
                        key={item.id}
                        item={item}
                        history={details.data?.history ?? []}
                        evidence={details.data?.evidence ?? []}
                        loading={details.isPending}
                        timezone={timezone}
                        onClose={onClose}
                        onConfirmed={savedItem}
                        embedded
                      />
                    ) : (
                      <section className={styles.panel}>
                        <h3>{item.title}</h3>
                        <p>{item.description}</p>
                        <p>You have read-only access to this task.</p>
                        <h3>Updates and evidence</h3>
                        {(details.data?.evidence ?? []).map((entry) => (
                          <article key={entry.id}>
                            <strong>{entry.author.name}</strong>
                            <p>{entry.body}</p>
                            <small>
                              {formatLiveDate(entry.createdAt, timezone)}
                            </small>
                          </article>
                        ))}
                        <h3>Change history</h3>
                        {(details.data?.history ?? []).map((entry) => (
                          <article key={entry.id}>
                            <p>{entry.summary}</p>
                            <small>
                              {formatLiveDate(entry.occurredAt, timezone)}
                            </small>
                          </article>
                        ))}
                      </section>
                    )}
                  </>
                ) : (
                  <LiveStateNotice
                    {...(itemQuery.error || details.error
                      ? presentLiveReadError(itemQuery.error ?? details.error)
                      : { kind: "loading", title: "Loading source task" })}
                    actions={
                      <button
                        type="button"
                        onClick={() => {
                          void itemQuery.refetch();
                          void details.refetch();
                        }}
                      >
                        Refresh source task
                      </button>
                    }
                  />
                )
              ) : null}
            </div>
            <div hidden={section !== "followup"} className={styles.section}>
              {visited.has("followup") && canWrite ? (
                <>
                  <h3>Create and delegate follow-up work</h3>
                  <p>
                    The issue context is included in the description. Choose a
                    project, owner and deadline.
                  </p>
                  <>
                    {createdLink ? (
                      <LiveStateNotice
                        kind="saved"
                        title="Follow-up task created"
                        actions={
                          <>
                            <Link href={createdLink}>Open created task</Link>
                            <button
                              type="button"
                              onClick={() => setCreatedLink("")}
                            >
                              Create another task
                            </button>
                          </>
                        }
                      />
                    ) : (
                      <Capture
                        embedded
                        workspaceId={workspace.id}
                        workspaceSlug={workspace.slug}
                        draftScope={`issue-capture:${signal.id}`}
                        initialTitle={`Follow up: ${signal.reason}`.slice(
                          0,
                          500,
                        )}
                        initialDescription={issueContext(signal, url, item)}
                        {...(item?.boardId
                          ? { defaultBoardId: item.boardId }
                          : {})}
                        {...(item?.planning?.teamId
                          ? { defaultTeamId: item.planning.teamId }
                          : {})}
                        onClose={() => go("overview")}
                        onConfirmed={(result) => {
                          setNotice(
                            `“${result.title}” was saved. The issue remains open while the work is addressed.`,
                          );
                          setCreatedLink(
                            result.destination === "board"
                              ? `${workspaceHref(workspace.slug)}/boards/${encodeURIComponent(result.boardId!)}#${encodeURIComponent(result.recordId)}`
                              : workspaceHref(workspace.slug, "inbox"),
                          );
                        }}
                      />
                    )}
                  </>
                </>
              ) : (
                <p>
                  Creating follow-up tasks is unavailable with your current
                  access.
                </p>
              )}
            </div>
            <div hidden={section !== "communication"}>
              {visited.has("communication") ? (
                <LiveIssueCommunication
                  signal={signal}
                  {...(item ? { item } : {})}
                  workspaceId={workspace.id}
                  workspaceSlug={workspace.slug}
                  url={url}
                  active={section === "communication"}
                />
              ) : null}
            </div>
            <div hidden={section !== "update"} className={styles.section}>
              {visited.has("update") && canWrite ? (
                <>
                  <h3>Publish a workspace update</h3>
                  <p>
                    Share progress, blockers and the next priority. Publishing
                    this review saves a workspace update and gives the issue a
                    fresh source to check.
                  </p>
                  <WeeklyReview workspaceId={workspace.id} />
                </>
              ) : null}
            </div>
          </Suspense>
          <details
            open={actionsOpen}
            onToggle={(event) => setActionsOpen(event.currentTarget.open)}
            className={styles.panel}
          >
            <summary>Record an outcome, snooze, or dismiss</summary>
            <p>
              Use this after addressing the cause, agreeing a follow-up, or
              establishing that the issue is not actionable.
            </p>
            <form
              className={styles.form}
              onSubmit={(event) => {
                event.preventDefault();
                const action =
                  chosenAction === "snooze"
                    ? "snooze"
                    : chosenAction === "dismiss"
                      ? "dismiss"
                      : "resolve";
                if (
                  !active ||
                  !canWrite ||
                  !hydrated ||
                  actionDraft.reason.trim().length < 3
                )
                  return;
                void onAction(signal, {
                  action,
                  reason: actionDraft.reason.trim(),
                  ...(action === "snooze"
                    ? {
                        snoozedUntil: new Date(
                          Date.now() + 86_400_000,
                        ).toISOString(),
                      }
                    : {}),
                });
              }}
            >
              <fieldset disabled={!active || !canWrite || pending || !hydrated}>
                <label>
                  Issue action
                  <select
                    value={chosenAction}
                    onChange={(event) =>
                      setChosenAction(
                        event.target.value as AttentionAction["action"],
                      )
                    }
                  >
                    <option value="resolve">Mark issue resolved</option>
                    <option value="snooze">Snooze for 24 hours</option>
                    <option value="dismiss">Dismiss as not actionable</option>
                  </select>
                </label>
                <label>
                  Outcome or reason
                  <textarea
                    rows={3}
                    required
                    minLength={3}
                    maxLength={1_000}
                    value={actionDraft.reason}
                    onChange={(event) =>
                      setActionDraft((current) => ({
                        ...current,
                        reason: event.target.value,
                      }))
                    }
                    placeholder="What was resolved, agreed, or found to be not actionable?"
                  />
                </label>
                <button
                  type="submit"
                  disabled={actionDraft.reason.trim().length < 3}
                  className={styles.primary}
                >
                  {pending
                    ? "Saving…"
                    : chosenAction === "snooze"
                      ? "Save snooze"
                      : chosenAction === "dismiss"
                        ? "Confirm dismissal"
                        : "Confirm issue resolved"}
                </button>
              </fieldset>
            </form>
          </details>
        </div>
        <footer className={styles.footer}>
          <Link href={workspaceHref(workspace.slug)}>
            {workspace.name}
            <ArrowUpRight size={14} />
          </Link>
          <span>
            <Clock3 size={14} />
            {active ? "Open issue" : "No longer active"}
          </span>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </div>
  );
}
