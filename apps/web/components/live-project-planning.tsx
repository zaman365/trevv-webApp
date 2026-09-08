"use client";

import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardDto } from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import {
  useAccessibleDialog,
  useLiveTeamDirectory,
} from "@/lib/live-collaboration";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { workspaceHref } from "@/lib/workspace-routes";
import { presentLiveError } from "@/lib/live-errors";
import { retainedKey } from "@/lib/live-work-view-helpers";
import { teamPlaybooks } from "@/lib/team-playbooks";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveStateNotice } from "./live-state";
import styles from "./live-operating-loop.module.css";

type PlanKind = NonNullable<BoardDto["planning"]>["kind"];
const kindLabels: Record<PlanKind, string> = {
  project: "Project",
  sprint: "Sprint",
  campaign: "Campaign",
  content: "Content calendar",
  backlog: "Backlog",
  operations: "Operations cycle",
  goals: "Company goals",
};

export function LiveProjectPlanning({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const data = useLiveAppRecords();
  const workspace = data.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  return (
    <WorkspaceFrame active="planning" workspaceSlug={workspaceSlug}>
      <main className={styles.main}>
        <header className={styles.hero}>
          <div>
            <p>{workspace?.name} / Delivery</p>
            <h1>Projects and sprints</h1>
            <span>
              Set a goal, give work an owner, and track milestones through to
              delivery.
            </span>
          </div>
          <Link href={workspaceHref(workspaceSlug, "guide")}>
            Step-by-step guide
          </Link>
        </header>
        {workspace ? (
          <ProjectPlanningContent
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
          />
        ) : (
          <LiveStateNotice
            kind="permission-loss"
            title="Workspace not available"
          />
        )}
      </main>
    </WorkspaceFrame>
  );
}

export function ProjectPlanningContent({
  workspaceId,
  workspaceSlug,
  teamId,
  parentBoard,
}: {
  workspaceId: string;
  workspaceSlug: string;
  teamId?: string;
  parentBoard?: BoardDto;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const directory = useLiveTeamDirectory(workspaceId);
  const query = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      workspaceId,
    ),
    queryFn: ({ signal }) => data.client.withSignal(signal).boards(workspaceId),
    staleTime: 15_000,
  });
  const [editing, setEditing] = useState<BoardDto | "new" | null>(null);
  const [filter, setFilter] = useState(teamId ?? "");
  const accessLost =
    query.error instanceof TrevvApiError &&
    [401, 403, 404].includes(query.error.status);
  const boards = accessLost ? [] : (query.data ?? []);
  const shown = boards.filter(
    (board) =>
      (!filter || board.planning?.teamId === filter) &&
      (!parentBoard || board.planning?.parentBoardId === parentBoard.id),
  );
  const canCreate =
    !["guest", "viewer"].includes(session.organization.role) && !accessLost;
  const team = directory.data?.teams.find(
    (entry) => entry.id === (teamId ?? filter),
  );
  return (
    <section
      className={styles.panel}
      aria-label={
        parentBoard ? "Project sprints and cycles" : "Project planning"
      }
    >
      <header>
        <div>
          <h2>
            {parentBoard
              ? "Sprints and cycles"
              : team
                ? `${team.name} projects`
                : "Project plans"}
          </h2>
          <p>
            {team
              ? teamPlaybooks[team.preset].outcome
              : "Projects hold the tasks. A sprint or campaign groups a dated delivery cycle within a project."}
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => setEditing("new")}
          >
            {parentBoard ? "Plan a sprint / cycle" : "New project / plan"}
          </button>
        ) : null}
      </header>
      {!teamId && directory.data?.teams.length ? (
        <label className={styles.field}>
          Team
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="">All teams</option>
            {directory.data.teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {query.isPending ? <p role="status">Loading projects…</p> : null}
      {query.error ? (
        <LiveStateNotice
          {...presentLiveError(query.error)}
          actions={
            <button type="button" onClick={() => void query.refetch()}>
              Retry projects
            </button>
          }
        />
      ) : null}
      {!shown.length && !query.isPending && !query.error ? (
        <p>
          {parentBoard
            ? "No delivery cycles yet. Set a sprint goal and dates, then add tasks from the project."
            : "Create a project, choose a team, and start with its first milestone."}
        </p>
      ) : null}
      <div className={styles.planGrid}>
        {shown.map((board) => {
          const items = data.items.filter(
            (item) =>
              item.workspaceId === workspaceId &&
              (board.planning?.parentBoardId
                ? item.planning?.cycleId === board.id ||
                  item.boardId === board.id
                : item.boardId === board.id),
          );
          const done = items.filter((item) => item.status === "done").length;
          const milestones = items.filter((item) => item.type === "milestone");
          const parent = boards.find(
            (entry) => entry.id === board.planning?.parentBoardId,
          );
          return (
            <article className={styles.planCard} key={board.id}>
              <small>
                {kindLabels[board.planning?.kind ?? "project"]} ·{" "}
                {board.planning?.state ?? "planned"}
                {parent ? ` · ${parent.name}` : ""}
              </small>
              <h3>
                <Link
                  href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(board.id)}`}
                >
                  {board.name}
                </Link>
              </h3>
              <p>
                {board.description ||
                  "Add the goal and success criteria in Edit plan."}
              </p>
              <span>
                {board.startDate ?? "No start date"} →{" "}
                {board.endDate ?? "No target date"}
              </span>
              <span>
                {done} / {items.length} tasks completed
                {data.recordsComplete ? "" : " · Loading work…"}
              </span>
              <progress
                aria-label={`${board.name} completion`}
                value={done}
                max={Math.max(1, items.length)}
              />
              {board.planning?.state === "completed" && done < items.length ? (
                <p>
                  {items.length - done} unfinished items remain visible. Move
                  them to the next cycle from each task’s planning fields.
                </p>
              ) : null}
              {milestones.length ? (
                <ul aria-label={`${board.name} milestones`}>
                  {milestones.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={`${workspaceHref(workspaceSlug)}/boards/${item.boardId}#${item.id}`}
                      >
                        {item.title}
                      </Link>{" "}
                      ·{" "}
                      {item.status === "done"
                        ? "Completed"
                        : (item.dueDate ?? "Set a due date")}
                    </li>
                  ))}
                </ul>
              ) : null}
              {canCreate ? (
                <button type="button" onClick={() => setEditing(board)}>
                  Edit{" "}
                  {kindLabels[board.planning?.kind ?? "project"].toLowerCase()}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      {editing ? (
        <PlanEditor
          key={editing === "new" ? "new" : editing.id}
          {...(editing === "new" ? {} : { board: editing })}
          workspaceId={workspaceId}
          boards={boards}
          teams={directory.data?.teams ?? []}
          initialTeamId={teamId ?? filter}
          {...(parentBoard ? { parentBoard } : {})}
          onClose={() => setEditing(null)}
          onSaved={(board) => {
            cache.setQueryData(
              workspaceResourceKeys.boards(
                session.organization.id,
                workspaceId,
              ),
              (current: BoardDto[] | undefined) => [
                ...(current ?? []).filter((entry) => entry.id !== board.id),
                board,
              ],
            );
            cache.setQueryData(
              workspaceResourceKeys.board(
                session.organization.id,
                workspaceId,
                board.id,
              ),
              board,
            );
            void cache.invalidateQueries({
              queryKey: workspaceResourceKeys.boards(
                session.organization.id,
                workspaceId,
              ),
            });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
}

export function PlanEditor({
  workspaceId,
  boards,
  teams,
  initialTeamId,
  parentBoard,
  board,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  boards: BoardDto[];
  teams: import("@founderhq/api-contract").TeamDto[];
  initialTeamId: string;
  parentBoard?: BoardDto;
  board?: BoardDto;
  onClose: () => void;
  onSaved: (board: BoardDto) => void;
}) {
  const { client } = useLiveAppRecords();
  const dialog = useAccessibleDialog<HTMLFormElement>(onClose);
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [kind, setKind] = useState<PlanKind>(
    board?.planning?.kind ?? (parentBoard ? "sprint" : "project"),
  );
  const [state, setState] = useState(board?.planning?.state ?? "planned");
  const [teamId, setTeamId] = useState(
    board?.planning?.teamId ?? initialTeamId ?? "",
  );
  const [parentId, setParentId] = useState(
    board?.planning?.parentBoardId ?? parentBoard?.id ?? "",
  );
  const [startDate, setStartDate] = useState(board?.startDate ?? "");
  const [endDate, setEndDate] = useState(board?.endDate ?? "");
  const [templateKey, setTemplateKey] = useState(board?.templateKey ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [versionTag, setVersionTag] = useState(board?.versionTag);
  const [latest, setLatest] = useState<BoardDto | null>(null);
  const keys = useRef(new Map<string, string>());
  const selectedTeam = teams.find((entry) => entry.id === teamId);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (pending || !name.trim()) return;
    setPending(true);
    setError(null);
    const planning = {
      kind,
      state,
      ...(teamId ? { teamId } : {}),
      ...(parentId ? { parentBoardId: parentId } : {}),
    };
    const input = {
      name: name.trim(),
      description,
      planning,
      ...(board
        ? { startDate: startDate || null, endDate: endDate || null }
        : {
            ...(startDate ? { startDate } : {}),
            ...(endDate ? { endDate } : {}),
          }),
    };
    const fingerprint = JSON.stringify({
      ...input,
      id: board?.id,
      version: versionTag,
    });
    try {
      const key = retainedKey(keys.current, fingerprint);
      const result = board
        ? await client.updateBoard(board.id, input, versionTag!, key)
        : await client.createBoard(
            {
              name: name.trim(),
              description,
              planning,
              ...(startDate ? { startDate } : {}),
              ...(endDate ? { endDate } : {}),
              workspaceId,
              visibility: "private",
              progressMode: "task_completion",
              ...(templateKey ? { templateKey } : {}),
            },
            key,
          );
      keys.current.delete(fingerprint);
      onSaved(result.data);
    } catch (reason) {
      setError(reason);
      if (board && reason instanceof TrevvApiError && reason.status === 409) {
        try {
          setLatest(await client.board(board.id));
        } catch {
          /* Keep the original error and draft. */
        }
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <div className={`dialog-layer ${styles.dialogLayer}`}>
      <form
        className={`capture-dialog ${styles.captureDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-title"
        ref={dialog}
        onSubmit={save}
      >
        <header>
          <div>
            <h2 id="plan-title">
              {board ? "Edit plan" : "Create a project or delivery cycle"}
            </h2>
            <p>Save a goal, a team and a timeline together.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close plan editor"
          >
            ×
          </button>
        </header>
        <fieldset className={styles.formBody} disabled={pending}>
          {error ? <LiveStateNotice {...presentLiveError(error)} /> : null}
          {latest && latest.versionTag !== versionTag ? (
            <LiveStateNotice
              kind="version-conflict"
              title="This plan changed while you were editing"
              description={`Latest saved plan: ${latest.name}. ${latest.description} Your draft is kept below.`}
              actions={
                <button
                  type="button"
                  onClick={() => {
                    setVersionTag(latest.versionTag);
                    setLatest(null);
                    setError(null);
                  }}
                >
                  Apply my draft to the latest plan
                </button>
              }
            />
          ) : null}
          <label className={styles.field}>
            Team
            <select
              aria-label="Team"
              value={teamId}
              onChange={(event) => setTeamId(event.target.value)}
            >
              <option value="">No team yet</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          {!board && selectedTeam ? (
            <label className={styles.field}>
              Start from a {teamPlaybooks[selectedTeam.preset].label} template
              <select
                aria-label={`Start from a ${teamPlaybooks[selectedTeam.preset].label} template`}
                value={templateKey}
                onChange={(event) => {
                  const template = teamPlaybooks[
                    selectedTeam.preset
                  ].plans.find(
                    (entry) => entry.templateKey === event.target.value,
                  );
                  setTemplateKey(event.target.value);
                  if (template) {
                    setName(template.name);
                    setDescription(template.description);
                    if (template.templateKey.includes("sprint"))
                      setKind("sprint");
                    else if (template.templateKey.includes("campaign"))
                      setKind("campaign");
                    else if (template.templateKey.includes("content"))
                      setKind("content");
                    else if (template.templateKey.includes("backlog"))
                      setKind("backlog");
                  }
                }}
              >
                <option value="">Blank plan</option>
                {teamPlaybooks[selectedTeam.preset].plans.map((entry) => (
                  <option key={entry.templateKey} value={entry.templateKey}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={styles.field}>
            Plan name
            <input
              aria-label="Plan name"
              autoFocus
              value={name}
              maxLength={160}
              required
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Plan type
              <select
                aria-label="Plan type"
                value={kind}
                onChange={(event) => setKind(event.target.value as PlanKind)}
              >
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              State
              <select
                aria-label="State"
                value={state}
                onChange={(event) =>
                  setState(event.target.value as typeof state)
                }
              >
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </label>
          </div>
          <label className={styles.field}>
            Parent project
            <select
              aria-label="Parent project"
              value={parentId}
              disabled={Boolean(board)}
              onChange={(event) => setParentId(event.target.value)}
            >
              <option value="">Standalone project</option>
              {boards
                .filter(
                  (entry) =>
                    !entry.planning?.parentBoardId && entry.id !== board?.id,
                )
                .map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
            </select>
          </label>
          <label className={styles.field}>
            Goal and success criteria
            <textarea
              aria-label="Goal and success criteria"
              value={description}
              rows={5}
              maxLength={5_000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              Start date
              <input
                aria-label="Start date"
                type="date"
                value={startDate}
                required={kind === "sprint"}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              Target date
              <input
                aria-label="Target date"
                type="date"
                min={startDate || undefined}
                required={kind === "sprint"}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
          </div>
          {state === "completed" ? (
            <p>
              Completing a cycle keeps unfinished tasks visible. Move them to
              the next cycle from the task’s planning fields.
            </p>
          ) : null}
        </fieldset>
        <footer>
          <span>
            {board
              ? "Changes are saved for everyone with project access."
              : "You can add tasks and milestones after creating this plan."}
          </span>
          <div>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="primary-button"
              disabled={pending || !name.trim()}
            >
              {pending ? "Saving…" : board ? "Save plan" : "Create plan"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
