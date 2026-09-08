"use client";

import { useQuery } from "@tanstack/react-query";
import type { WorkItemDto, TeamPreset } from "@founderhq/api-contract";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { isLiveAccessLoss } from "@/lib/live-errors";
import { AppLink as Link } from "@/components/navigation-link";
import { workspaceHref } from "@/lib/workspace-routes";
import styles from "./live-operating-loop.module.css";

type Planning = NonNullable<WorkItemDto["planning"]>;

export function LiveTaskPlanningSummary({ item }: { item: WorkItemDto }) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const directory = useLiveTeamDirectory(item.workspaceId);
  const boards = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      item.workspaceId,
    ),
    queryFn: ({ signal }) =>
      data.client.withSignal(signal).boards(item.workspaceId),
    staleTime: 30_000,
  });
  if (isLiveAccessLoss(boards.error) || isLiveAccessLoss(directory.error))
    return null;
  const planning = item.planning ?? {};
  const board = boards.data?.find((entry) => entry.id === item.boardId);
  const team = directory.data?.teams.find(
    (entry) => entry.id === (planning.teamId ?? board?.planning?.teamId),
  );
  const cycle = boards.data?.find((entry) => entry.id === planning.cycleId);
  const milestone = data.items.find(
    (entry) =>
      entry.id === planning.milestoneId &&
      entry.workspaceId === item.workspaceId,
  );
  const contributors =
    item.type === "milestone"
      ? data.items.filter(
          (entry) =>
            entry.workspaceId === item.workspaceId &&
            entry.planning?.milestoneId === item.id,
        )
      : [];
  const workspace = data.workspaces.find(
    (entry) => entry.id === item.workspaceId,
  );
  const base = workspace ? workspaceHref(workspace.slug) : "";
  if (!team && !Object.keys(planning).length && item.type !== "milestone")
    return null;
  return (
    <section
      className={styles.detailEditor}
      aria-label="Saved planning context"
    >
      <h3>Planning and context</h3>
      <dl className={styles.contextSummary}>
        {team ? (
          <>
            <dt>Team</dt>
            <dd>{team.name}</dd>
          </>
        ) : null}
        {planning.workKind ? (
          <>
            <dt>Work category</dt>
            <dd>{planning.workKind}</dd>
          </>
        ) : null}
        {cycle ? (
          <>
            <dt>Sprint / cycle</dt>
            <dd>
              {base ? (
                <Link href={`${base}/boards/${cycle.id}`}>{cycle.name}</Link>
              ) : (
                cycle.name
              )}{" "}
              · {cycle.planning?.state}
            </dd>
          </>
        ) : null}
        {milestone ? (
          <>
            <dt>Milestone</dt>
            <dd>
              {base ? (
                <Link
                  href={`${base}/boards/${milestone.boardId}#${milestone.id}`}
                >
                  {milestone.title}
                </Link>
              ) : (
                milestone.title
              )}
            </dd>
          </>
        ) : null}
        {planning.topic ? (
          <>
            <dt>Topic / workstream</dt>
            <dd>{planning.topic}</dd>
          </>
        ) : null}
        {planning.estimate !== undefined ? (
          <>
            <dt>Estimate</dt>
            <dd>{planning.estimate} points or hours</dd>
          </>
        ) : null}
        {planning.acceptanceCriteria ? (
          <>
            <dt>Acceptance criteria</dt>
            <dd>{planning.acceptanceCriteria}</dd>
          </>
        ) : null}
        {Object.entries(planning.details ?? {}).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {item.type === "milestone" ? (
        <div>
          <p>
            {contributors.filter((entry) => entry.status === "done").length} /{" "}
            {contributors.length} linked tasks completed
            {data.recordsComplete ? "" : " · Loading work…"}
          </p>
          {contributors.length ? (
            <ul>
              {contributors.map((entry) => (
                <li key={entry.id}>
                  {base ? (
                    <Link href={`${base}/boards/${entry.boardId}#${entry.id}`}>
                      {entry.title}
                    </Link>
                  ) : (
                    entry.title
                  )}{" "}
                  ·{" "}
                  {entry.status === "done"
                    ? "Completed"
                    : entry.status.replaceAll("_", " ")}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Link tasks to this milestone in their planning fields to track
              delivery.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
export const departmentWorkContext: Record<
  TeamPreset,
  { kinds: string[]; fields: string[] }
> = {
  marketing: {
    kinds: ["Campaign task", "Content", "Creative review", "Experiment"],
    fields: ["Audience", "Channel", "Success metric", "Asset link"],
  },
  technology: {
    kinds: ["Story", "Bug", "Technical task", "Incident"],
    fields: [
      "System / component",
      "Environment",
      "Severity",
      "Pull request / design link",
    ],
  },
  sales: {
    kinds: ["Customer follow-up", "Proposal", "Demo", "Handoff"],
    fields: ["Account", "Contact", "Deal value", "Next customer action"],
  },
  operations: {
    kinds: ["Recurring operation", "Handoff", "Process change", "Issue"],
    fields: ["Process / service", "Cadence", "Handoff to", "Escalation path"],
  },
  leadership: {
    kinds: ["Objective", "Decision preparation", "Review", "Company milestone"],
    fields: [
      "Business outcome",
      "Success measure",
      "Stakeholders",
      "Review date",
    ],
  },
  custom: {
    kinds: ["Task", "Deliverable", "Research", "Follow-up"],
    fields: ["Outcome", "Reference link"],
  },
};

export function LiveTaskPlanningFields({
  workspaceId,
  boardId,
  itemId,
  value = {},
  onChange,
}: {
  workspaceId: string;
  boardId: string;
  itemId?: string;
  value?: Planning;
  onChange: (planning: Planning) => void;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const directory = useLiveTeamDirectory(workspaceId);
  const query = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      workspaceId,
    ),
    queryFn: ({ signal }) => data.client.withSignal(signal).boards(workspaceId),
    staleTime: 30_000,
  });
  const accessLost =
    isLiveAccessLoss(query.error) || isLiveAccessLoss(directory.error);
  const boards = accessLost ? [] : (query.data ?? []);
  const board = boards.find((entry) => entry.id === boardId);
  const projectId = board?.planning?.parentBoardId ?? boardId;
  const cycles = boards.filter(
    (entry) => entry.planning?.parentBoardId === projectId,
  );
  const teams = accessLost ? [] : (directory.data?.teams ?? []);
  const milestones = (accessLost ? [] : data.items).filter(
    (entry) =>
      entry.workspaceId === workspaceId &&
      entry.boardId === projectId &&
      entry.type === "milestone" &&
      entry.id !== itemId,
  );
  const team = teams.find(
    (entry) => entry.id === (value.teamId ?? board?.planning?.teamId),
  );
  const context = departmentWorkContext[team?.preset ?? "custom"];
  function change(key: keyof Planning, next: string | number) {
    const update = { ...value };
    if (next === "") delete update[key];
    else Object.assign(update, { [key]: next });
    onChange(update);
  }
  if (accessLost)
    return (
      <p role="status">
        Planning access changed. Reload this workspace before editing.
      </p>
    );
  return (
    <details className={styles.planningFields}>
      <summary>Planning and {team?.name ?? "team"} context</summary>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          Responsible team
          <select
            aria-label="Responsible team"
            value={value.teamId ?? ""}
            onChange={(event) => change("teamId", event.target.value)}
          >
            <option value="">
              {board?.planning?.teamId ? "Use project team" : "No team yet"}
            </option>
            {teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Work category
          <select
            aria-label="Work category"
            value={value.workKind ?? ""}
            onChange={(event) => change("workKind", event.target.value)}
          >
            <option value="">Choose category</option>
            {value.workKind && !context.kinds.includes(value.workKind) ? (
              <option>{value.workKind}</option>
            ) : null}
            {context.kinds.map((kind) => (
              <option key={kind}>{kind}</option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Sprint / delivery cycle
          <select
            aria-label="Sprint / delivery cycle"
            value={value.cycleId ?? ""}
            onChange={(event) => change("cycleId", event.target.value)}
          >
            <option value="">Backlog — no cycle</option>
            {cycles.map((entry) => (
              <option
                key={entry.id}
                value={entry.id}
                disabled={
                  entry.planning?.state === "completed" &&
                  value.cycleId !== entry.id
                }
              >
                {entry.name} · {entry.planning?.state}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Milestone
          <select
            aria-label="Milestone"
            value={value.milestoneId ?? ""}
            onChange={(event) => change("milestoneId", event.target.value)}
          >
            <option value="">No milestone</option>
            {milestones.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          Topic / workstream
          <input
            aria-label="Topic / workstream"
            value={value.topic ?? ""}
            maxLength={160}
            onChange={(event) => change("topic", event.target.value)}
            placeholder={
              team?.preset === "marketing"
                ? "September launch"
                : "Checkout redesign"
            }
          />
        </label>
        <label className={styles.field}>
          Estimate (points or hours)
          <input
            aria-label="Estimate (points or hours)"
            type="number"
            min="0"
            max="10000"
            step="0.5"
            value={value.estimate ?? ""}
            onChange={(event) =>
              change(
                "estimate",
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
          />
        </label>
      </div>
      <label className={styles.field}>
        Acceptance criteria
        <textarea
          aria-label="Acceptance criteria"
          value={value.acceptanceCriteria ?? ""}
          rows={3}
          maxLength={5_000}
          onChange={(event) => change("acceptanceCriteria", event.target.value)}
          placeholder="How will the owner and reviewer know this is done?"
        />
      </label>
      <div className={styles.formGrid}>
        {[
          ...new Set([...context.fields, ...Object.keys(value.details ?? {})]),
        ].map((field) => (
          <label className={styles.field} key={field}>
            {field}
            <input
              aria-label={field}
              value={value.details?.[field] ?? ""}
              maxLength={2_000}
              onChange={(event) => {
                const details = { ...value.details };
                if (event.target.value) details[field] = event.target.value;
                else delete details[field];
                onChange({ ...value, details });
              }}
            />
          </label>
        ))}
      </div>
      {query.error || directory.error ? (
        <p role="status">
          Some planning choices could not be loaded.{" "}
          <button
            type="button"
            onClick={() => {
              void query.refetch();
              void directory.refetch();
            }}
          >
            Retry choices
          </button>
        </p>
      ) : null}
    </details>
  );
}
