"use client";

import { Activity, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  RefreshCw,
} from "lucide-react";
import { TrevvApiError } from "@founderhq/api-client";
import type { WorkItemDto } from "@founderhq/api-contract";
import { AppLink as Link } from "@/components/navigation-link";
import { useReportRouteReady } from "@/lib/navigation-performance";
import { useAppSession } from "@/lib/app-session-context";
import {
  LiveAppDataProvider,
  useOptionalLiveAppRecords,
  useLiveAppRecords,
} from "@/lib/live-app-data";
import { useWorkItemDetails } from "@/lib/use-work-item-details";
import { workspaceHref } from "@/lib/workspace-routes";
import { formatLiveDate, formatLiveDateOnly } from "@/lib/live-workflow-ui";
import { WorkspaceFrame } from "./workspace-frame";
import { WorkItemDetail } from "./live-board-experience";
import { LiveTaskPlanningSummary } from "./live-task-planning-fields";
import {
  TaskReviewPanel,
  TaskText,
  reviewStateLabel,
} from "./task-review-panel";
import { PersonIdentity } from "./person-identity";
import styles from "./task-page.module.css";

export function TaskPage(props: { workspaceSlug: string; itemId: string }) {
  const live = useOptionalLiveAppRecords();
  return live ? (
    <TaskPageContent {...props} />
  ) : (
    <LiveAppDataProvider>
      <TaskPageContent {...props} />
    </LiveAppDataProvider>
  );
}
function TaskPageContent({
  workspaceSlug,
  itemId,
}: {
  workspaceSlug: string;
  itemId: string;
}) {
  const data = useLiveAppRecords();
  const session = useAppSession();
  const cache = useQueryClient();
  const workspace = data.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const timezone = session.organization.timezone ?? "UTC";
  const key = [
    "workspace-resources",
    session.organization.id,
    workspace?.id ?? "",
    "task-page",
    itemId,
  ];
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(workspace),
    staleTime: 5000,
    refetchInterval: 10000,
    queryFn: async ({ signal }) => {
      const item = await data.client.withSignal(signal).item(itemId);
      if (item.workspaceId !== workspace?.id)
        throw new Error("This task does not belong to this workspace.");
      return item;
    },
  });
  useReportRouteReady(query.isSuccess && !data.accessLost);
  const details = useWorkItemDetails(
    data.client,
    session.organization.id,
    workspace?.id,
    itemId,
  );
  const detailsAccessDenied =
    details.error instanceof TrevvApiError &&
    [401, 403, 404].includes(details.error.status);
  const history = detailsAccessDenied ? [] : (details.data?.history ?? []);
  const evidence = detailsAccessDenied ? [] : (details.data?.evidence ?? []);
  const [section, setSection] = useState("overview");
  const [visited, setVisited] = useState(["overview"]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const update = () => {
      const value = ["reviews", "activity", "edit"].includes(
        location.hash.slice(1),
      )
        ? location.hash.slice(1)
        : "overview";
      setSection(value);
      setVisited((previous) =>
        previous.includes(value) ? previous : [...previous, value],
      );
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, [itemId]);
  function select(value: string) {
    setSection(value);
    setVisited((previous) =>
      previous.includes(value) ? previous : [...previous, value],
    );
    window.history.replaceState(null, "", `#${value}`);
  }
  async function confirmed(item: WorkItemDto, message: string) {
    cache.setQueryData(key, item);
    setNotice(message);
    await data.applyConfirmedItem(item);
    await details.refetch();
  }
  const accessDenied =
    query.error instanceof TrevvApiError &&
    [401, 403, 404].includes(query.error.status);
  const item = accessDenied || data.accessLost ? undefined : query.data;
  const currentStage =
    item?.status === "done"
      ? 3
      : item?.status === "review"
        ? 2
        : item?.status === "not_started"
          ? 0
          : 1;
  return (
    <WorkspaceFrame active="myWork" workspaceSlug={workspaceSlug}>
      <main className={styles.page} data-testid="task-page">
        <Link
          className={styles.back}
          href={workspaceHref(workspaceSlug, "my-work")}
        >
          <ArrowLeft size={16} /> My Work
        </Link>
        {!item ? (
          <section className={styles.panel}>
            <h1>
              {query.isPending && workspace
                ? "Loading task…"
                : "Task unavailable"}
            </h1>
            <p>
              {query.error instanceof Error
                ? query.error.message
                : "Checking task and workspace access."}
            </p>
            <button type="button" onClick={() => void query.refetch()}>
              Retry
            </button>
          </section>
        ) : (
          <>
            {query.error && !accessDenied && (
              <p role="status">
                Could not refresh the task. Your last saved version and drafts
                are kept.{" "}
                <button type="button" onClick={() => void query.refetch()}>
                  Retry refresh
                </button>
              </p>
            )}
            <header className={styles.heading}>
              <div>
                <div className={styles.eyebrow}>
                  {item.planning?.workKind ?? item.type}
                  <span className={styles.badge}>
                    {
                      {
                        not_started: "Not started",
                        working: "In progress",
                        review: "In review",
                        blocked: "Blocked",
                        done: "Completed",
                      }[item.status]
                    }
                  </span>
                </div>
                <h1>{item.title}</h1>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  aria-label="Refresh task"
                  title="Refresh task"
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw size={16} />
                </button>
                <button type="button" onClick={() => select("edit")}>
                  <Pencil size={15} /> Edit task
                </button>
                {item.type === "task" && (
                  <button
                    className={styles.primary}
                    type="button"
                    onClick={() => select("reviews")}
                  >
                    <ClipboardCheck size={16} />{" "}
                    {item.review?.state === "pending"
                      ? "View review"
                      : "Send for review"}
                  </button>
                )}
              </div>
            </header>
            <ol className={styles.lifecycle} aria-label="Task lifecycle">
              {["Created", "In progress", "Review", "Completed"].map(
                (label, index) => (
                  <li
                    key={label}
                    aria-current={index === currentStage ? "step" : undefined}
                    data-passed={index < currentStage}
                  >
                    <span>
                      {index < currentStage ? (
                        <CheckCircle2 size={16} />
                      ) : (
                        index + 1
                      )}
                    </span>
                    {label}
                    {index === currentStage && item.status === "blocked"
                      ? " · Blocked"
                      : ""}
                  </li>
                ),
              )}
            </ol>
            <nav className={styles.tabs} aria-label="Task sections">
              {[
                "overview",
                ...(item.type === "task" ? ["reviews"] : []),
                "activity",
                "edit",
              ].map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-current={section === value ? "page" : undefined}
                  onClick={() => select(value)}
                >
                  {value === "edit"
                    ? "Edit & actions"
                    : value === "reviews"
                      ? `Reviews${item.review ? ` · Round ${item.review.round}` : ""}`
                      : value === "activity"
                        ? "Activity & evidence"
                        : "Overview"}
                </button>
              ))}
            </nav>
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {section === "overview" && (
              <div className={styles.columns}>
                <div className={styles.stack}>
                  <section className={styles.panel}>
                    <h2>Task brief</h2>
                    <TaskText
                      text={
                        item.description ||
                        "No description yet. Add the goal, expected outcome and acceptance criteria in Edit task."
                      }
                    />
                    <LiveTaskPlanningSummary item={item} />
                  </section>
                  <section className={styles.panel}>
                    <h2>Next steps</h2>
                    <p>
                      {item.status === "done"
                        ? "This task is complete. Its evidence, reviews and history remain available. Reopen it if more work is needed."
                        : item.review
                          ? reviewStateLabel[item.review.state] +
                            ". Open Reviews to see feedback and individual responses."
                          : "Keep progress current, add results and evidence, then request review when the work is ready."}
                    </p>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => select("edit")}>
                        {item.status === "done"
                          ? "Reopen task"
                          : "Update progress / complete"}
                      </button>
                      <button type="button" onClick={() => select("activity")}>
                        View history
                      </button>
                    </div>
                  </section>
                </div>
                <aside className={styles.stack} aria-label="Task information">
                  <section className={styles.panel}>
                    <h2>Details</h2>
                    <dl className={styles.facts}>
                      <div>
                        <dt>Owner</dt>
                        <dd>
                          {item.assignees.length
                            ? item.assignees.map((person) => (
                                <PersonIdentity
                                  key={person.id}
                                  workspaceSlug={workspaceSlug}
                                  userId={person.id}
                                  name={person.name}
                                />
                              ))
                            : "Unassigned"}
                        </dd>
                      </div>
                      <div>
                        <dt>Priority</dt>
                        <dd>{item.priority}</dd>
                      </div>
                      <div>
                        <dt>Due date</dt>
                        <dd>
                          {item.dueDate
                            ? formatLiveDateOnly(item.dueDate, timezone)
                            : "Not scheduled"}
                        </dd>
                      </div>
                      <div>
                        <dt>Created</dt>
                        <dd>{formatLiveDate(item.createdAt, timezone)}</dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatLiveDate(item.updatedAt, timezone)}</dd>
                      </div>
                      {item.review && (
                        <div>
                          <dt>Review</dt>
                          <dd>
                            {
                              item.review.reviewers.filter(
                                (person) => person.decision === "approved",
                              ).length
                            }{" "}
                            / {item.review.reviewers.length} approved ·{" "}
                            {reviewStateLabel[item.review.state]}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <Link
                      className={styles.back}
                      href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(item.boardId)}`}
                    >
                      Open board <ArrowUpRight size={15} />
                    </Link>
                  </section>
                  {data.waiting
                    .filter(
                      (entry) =>
                        entry.entityId === item.id && !entry.resolvedAt,
                    )
                    .map((entry) => (
                      <section key={entry.id} className={styles.panel}>
                        <h2>Waiting</h2>
                        <p>{entry.waitingLabel ?? entry.title}</p>
                        <p>Follow-up owner: {entry.followUpOwnerName}</p>
                        <Link href={workspaceHref(workspaceSlug, "waiting")}>
                          Manage follow-up
                        </Link>
                      </section>
                    ))}
                </aside>
              </div>
            )}
            {visited.includes("reviews") && (
              <Activity mode={section === "reviews" ? "visible" : "hidden"}>
                <TaskReviewPanel
                  key={item.id}
                  item={item}
                  history={history}
                  onConfirmed={confirmed}
                />
              </Activity>
            )}
            {section === "activity" && (
              <div className={styles.columns}>
                <section className={styles.panel}>
                  <h2>Lifecycle history</h2>
                  {details.isPending ? <p>Loading history…</p> : null}
                  {details.error ? (
                    <p role="alert">
                      History could not be loaded.{" "}
                      <button
                        type="button"
                        onClick={() => void details.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  ) : null}
                  <ol className={styles.timeline}>
                    {[...history].reverse().map((entry) => (
                      <li key={entry.id}>
                        <TaskText text={entry.summary} />
                        {Array.isArray(entry.metadata.changes) &&
                          entry.metadata.changes.length > 0 && (
                            <details>
                              <summary>What changed</summary>
                              <dl className={styles.facts}>
                                {entry.metadata.changes.map((change, index) => {
                                  if (
                                    !change ||
                                    typeof change !== "object" ||
                                    !("field" in change) ||
                                    !("before" in change) ||
                                    !("after" in change)
                                  )
                                    return null;
                                  return (
                                    <div key={index}>
                                      <dt>
                                        {String(change.field).replace(
                                          "dueDate",
                                          "Due date",
                                        )}
                                      </dt>
                                      <dd>
                                        {String(change.before || "Not set")} →{" "}
                                        {String(change.after || "Not set")}
                                      </dd>
                                    </div>
                                  );
                                })}
                              </dl>
                            </details>
                          )}

                        <small>
                          {entry.actor?.name ?? "System"} ·{" "}
                          {formatLiveDate(entry.occurredAt, timezone)}
                        </small>
                      </li>
                    ))}
                  </ol>
                  {details.data?.history.length === 0 && (
                    <p>No earlier activity recorded.</p>
                  )}
                </section>
                <section className={styles.panel}>
                  <header className={styles.panelHeading}>
                    <h2>Results & evidence</h2>
                    <button type="button" onClick={() => select("edit")}>
                      Add update
                    </button>
                  </header>
                  {details.data?.evidence.length === 0 && (
                    <p>Attach results, notes or links using Add update.</p>
                  )}
                  {evidence.map((entry) => (
                    <article className={styles.evidence} key={entry.id}>
                      <TaskText text={entry.body} />
                      <small>
                        {entry.author.name} ·{" "}
                        {formatLiveDate(entry.createdAt, timezone)}
                      </small>
                    </article>
                  ))}
                </section>
              </div>
            )}
            {visited.includes("edit") && (
              <Activity mode={section === "edit" ? "visible" : "hidden"}>
                <section className={styles.editPanel}>
                  <p className={styles.muted}>
                    Manage the task below. Changes, review decisions and
                    completion evidence are retained in its history.
                  </p>
                  <WorkItemDetail
                    embedded
                    organized
                    key={item.id}
                    item={item}
                    timezone={timezone}
                    history={history}
                    evidence={evidence}
                    loading={details.isPending}
                    onClose={() => select("overview")}
                    onConfirmed={confirmed}
                  />
                </section>
              </Activity>
            )}
          </>
        )}
      </main>
    </WorkspaceFrame>
  );
}
