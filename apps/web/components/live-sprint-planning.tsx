"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardDto } from "@founderhq/api-contract";
import { TrevvApiError } from "@founderhq/api-client";
import { ArrowUpRight, Plus, RefreshCw } from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { presentLiveReadError } from "@/lib/live-errors";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { workspaceHref } from "@/lib/workspace-routes";
import { dashboardPlanItems } from "@/lib/workspace-dashboard";
import { formatLiveDateOnly } from "@/lib/live-workflow-ui";
import { PlanEditor } from "./live-project-planning";
import { LiveMyWork } from "./live-work-my-work";
import { LiveQuickCaptureDialog } from "./lazy-create-dialogs";
import { LiveStateNotice } from "./live-state";
import styles from "./live-sprint-planning.module.css";

type SprintState = NonNullable<BoardDto["planning"]>["state"];
const states = ["all", "active", "planned", "completed"] as const;
const labels = {
  all: "All sprints",
  active: "Active",
  planned: "Planned",
  completed: "Completed",
};
const order = { active: 0, planned: 1, completed: 2 };

export function SprintPlanningContent({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const timezone = session.organization.timezone ?? "UTC";
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const directory = useLiveTeamDirectory(workspaceId);
  const boardsKey = workspaceResourceKeys.boards(
    session.organization.id,
    workspaceId,
  );
  const query = useQuery({
    queryKey: boardsKey,
    queryFn: ({ signal }) => data.client.withSignal(signal).boards(workspaceId),
    staleTime: 15_000,
  });
  const [stateFilter, setStateFilter] =
    useState<(typeof states)[number]>("all");
  const [teamFilter, setTeamFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [workScope, setWorkScope] = useState<"sprint" | "backlog">("sprint");
  const [editing, setEditing] = useState<{
    board?: BoardDto;
    state?: SprintState;
  } | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const trigger = useRef<HTMLElement | null>(null);
  const accessLost =
    data.accessLost ||
    (query.error instanceof TrevvApiError &&
      [401, 403, 404].includes(query.error.status));
  const boards = accessLost
    ? []
    : (query.data ?? []).filter((board) => board.workspaceId === workspaceId);
  const sprints = boards.filter((board) => board.planning?.kind === "sprint");
  const scoped = sprints.filter(
    (board) => !teamFilter || board.planning?.teamId === teamFilter,
  );
  const shown = scoped
    .filter(
      (board) => stateFilter === "all" || board.planning?.state === stateFilter,
    )
    .sort(
      (a, b) =>
        order[a.planning!.state] - order[b.planning!.state] ||
        (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") ||
        a.name.localeCompare(b.name),
    );
  const selected = shown.find((board) => board.id === selectedId) ?? shown[0];
  const parent = boards.find(
    (board) => board.id === selected?.planning?.parentBoardId,
  );
  const items = accessLost
    ? []
    : data.items.filter((item) => item.workspaceId === workspaceId);
  const work = selected ? dashboardPlanItems(items, selected) : [];
  const backlog = parent
    ? items.filter(
        (item) =>
          item.boardId === parent.id &&
          !item.planning?.cycleId &&
          item.status !== "done",
      )
    : [];
  const canEdit =
    !accessLost && !["guest", "viewer"].includes(session.organization.role);
  const captureBoard = boards.find((board) => board.id === captureId);
  const complete = data.recordsComplete;
  function edit(board?: BoardDto, state?: SprintState) {
    trigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setEditing({ ...(board ? { board } : {}), ...(state ? { state } : {}) });
  }
  function saved(board: BoardDto) {
    cache.setQueryData(boardsKey, (current: BoardDto[] | undefined) => [
      ...(current ?? []).filter((entry) => entry.id !== board.id),
      board,
    ]);
    cache.setQueryData(
      workspaceResourceKeys.board(
        session.organization.id,
        workspaceId,
        board.id,
      ),
      board,
    );
    void cache.invalidateQueries({ queryKey: boardsKey });
    setSelectedId(board.id);
    setStateFilter(board.planning?.state ?? "all");
    setTeamFilter(board.planning?.teamId ?? "");
    setWorkScope("sprint");
    setConfirmation(`${board.name} saved.`);
    setEditing(null);
  }
  return (
    <section aria-label="Sprint planning" className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Sprint status">
          {states.map((state) => (
            <button
              key={state}
              type="button"
              aria-pressed={stateFilter === state}
              onClick={() => setStateFilter(state)}
            >
              {labels[state]}{" "}
              <span>
                {
                  scoped.filter(
                    (board) =>
                      state === "all" || board.planning?.state === state,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            aria-label="Refresh sprints"
            title="Refresh sprints"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw size={16} aria-hidden="true" />
          </button>
          <Link href={workspaceHref(workspaceSlug, "planning")}>
            Projects and other plans{" "}
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
          {canEdit && (
            <button
              className="primary-button"
              type="button"
              onClick={() => edit()}
            >
              <Plus size={16} aria-hidden="true" /> Plan sprint
            </button>
          )}
        </div>
      </div>
      {!!directory.data?.teams.length && (
        <label className={styles.teamFilter}>
          Team
          <select
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
          >
            <option value="">All teams</option>
            {directory.data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {confirmation && <p role="status">{confirmation}</p>}
      {query.isPending && <p role="status">Loading sprints…</p>}
      {query.error && (
        <LiveStateNotice
          {...presentLiveReadError(query.error)}
          actions={
            <button type="button" onClick={() => void query.refetch()}>
              Retry sprints
            </button>
          }
        />
      )}
      {data.accessLost && !query.error && (
        <LiveStateNotice
          kind="permission-loss"
          title="Workspace not available"
        />
      )}
      {!query.isPending && !query.error && !accessLost && !shown.length && (
        <div className={styles.empty}>
          <h3>
            {sprints.length
              ? "No sprints match these filters"
              : "Plan your first sprint"}
          </h3>
          <p>
            {sprints.length
              ? "Choose another status or team to see its sprints."
              : "Choose a goal, a team and a start and end date. Then add the work the team will deliver in this sprint."}
          </p>
          {!!sprints.length && (
            <button
              type="button"
              onClick={() => {
                setStateFilter("all");
                setTeamFilter("");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div className={styles.cards}>
        {shown.map((board) => {
          const tasks = dashboardPlanItems(items, board);
          const done = tasks.filter((item) => item.status === "done").length;
          const blocked = tasks.filter(
            (item) => item.status === "blocked",
          ).length;
          const team = directory.data?.teams.find(
            (entry) => entry.id === board.planning?.teamId,
          );
          const project = boards.find(
            (entry) => entry.id === board.planning?.parentBoardId,
          );
          return (
            <article
              aria-label={`${board.name} sprint`}
              className={styles.card}
              data-selected={selected?.id === board.id}
              key={board.id}
            >
              <div className={styles.cardTop}>
                <span
                  className={styles.badge}
                  data-state={board.planning!.state}
                >
                  {labels[board.planning!.state]}
                </span>
                <span>{team?.name ?? "No team assigned"}</span>
              </div>
              <h3>
                <button
                  type="button"
                  aria-pressed={selected?.id === board.id}
                  aria-controls="selected-sprint-work"
                  onClick={() => {
                    setSelectedId(board.id);
                    setWorkScope("sprint");
                  }}
                >
                  {board.name}
                </button>
              </h3>
              <p className={styles.goal}>
                {board.description || "Add a sprint goal in Edit sprint."}
              </p>
              {project && <small>Project · {project.name}</small>}
              <span className={styles.dates}>
                {board.startDate
                  ? formatLiveDateOnly(board.startDate, timezone)
                  : "Set start date"}{" "}
                →{" "}
                {board.endDate
                  ? formatLiveDateOnly(board.endDate, timezone)
                  : "Set end date"}
              </span>
              <div className={styles.progressLabel}>
                <span>
                  {complete
                    ? `${done} / ${tasks.length} work items completed`
                    : "Loading sprint work…"}
                </span>
                {complete && (
                  <strong>
                    {tasks.length ? Math.round((done / tasks.length) * 100) : 0}
                    %
                  </strong>
                )}
              </div>
              <progress
                aria-label={`${board.name} completion`}
                {...(complete ? { value: done } : {})}
                max={Math.max(1, tasks.length)}
              />
              {complete && blocked > 0 && (
                <span className={styles.blocked}>
                  {blocked} blocked · needs attention
                </span>
              )}
            </article>
          );
        })}
      </div>
      {selected && (
        <section
          id="selected-sprint-work"
          className={styles.detail}
          aria-label={`${selected.name} sprint details`}
        >
          <header className={styles.toolbar}>
            <div>
              <small>{labels[selected.planning!.state]} sprint</small>
              <h3>{selected.name}</h3>
            </div>
            <div className={styles.actions}>
              <Link
                href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(selected.id)}`}
              >
                Open sprint board <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              {canEdit && (
                <>
                  <button type="button" onClick={() => edit(selected)}>
                    Edit sprint
                  </button>
                  {selected.planning?.state !== "completed" && (
                    <button
                      type="button"
                      onClick={() =>
                        edit(
                          selected,
                          selected.planning?.state === "active"
                            ? "completed"
                            : "active",
                        )
                      }
                    >
                      {selected.planning?.state === "active"
                        ? "Review and complete"
                        : "Start sprint"}
                    </button>
                  )}
                  {selected.planning?.state !== "completed" && (
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => {
                        trigger.current = document.activeElement as HTMLElement;
                        setCaptureId(selected.id);
                      }}
                    >
                      Add sprint task
                    </button>
                  )}
                </>
              )}
            </div>
          </header>
          <p className={styles.goal}>
            {selected.description ||
              "Set a clear goal and success criteria in Edit sprint."}
          </p>
          {selected.planning?.state === "completed" &&
            complete &&
            work.some((item) => item.status !== "done") && (
              <p className={styles.blocked}>
                Unfinished work stays visible. Open a task to move it to the
                next sprint or return it to the project backlog.
              </p>
            )}
          {parent && (
            <div className={styles.toolbar}>
              <div
                className={styles.filters}
                role="group"
                aria-label="Sprint work scope"
              >
                <button
                  type="button"
                  aria-pressed={workScope === "sprint"}
                  onClick={() => setWorkScope("sprint")}
                >
                  Sprint work
                </button>
                <button
                  type="button"
                  aria-pressed={workScope === "backlog"}
                  onClick={() => setWorkScope("backlog")}
                >
                  Project backlog
                </button>
              </div>
              <Link
                href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(parent.id)}`}
              >
                Open {parent.name}
              </Link>
            </div>
          )}
          {parent && workScope === "backlog" && (
            <p>
              Unscheduled open work from {parent.name}. Open a task and choose
              this sprint in its planning fields to include it.
            </p>
          )}
          <LiveMyWork
            key={`${selected.id}:${parent ? workScope : "sprint"}`}
            items={parent && workScope === "backlog" ? backlog : work}
            assignedToMe={false}
            initialPeriod="all"
            workspaceSlug={workspaceSlug}
            title={
              parent && workScope === "backlog"
                ? "Project backlog"
                : "Sprint work"
            }
          />
        </section>
      )}
      {editing && canEdit && (
        <PlanEditor
          workspaceId={workspaceId}
          boards={boards}
          teams={directory.data?.teams ?? []}
          initialTeamId={teamFilter}
          sprintFocus
          {...(editing.board ? { board: editing.board } : {})}
          {...(editing.state ? { initialState: editing.state } : {})}
          returnFocusRef={trigger}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      )}
      {captureBoard && canEdit && (
        <LiveQuickCaptureDialog
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
          defaultBoardId={captureBoard.id}
          {...(captureBoard.planning?.teamId
            ? { defaultTeamId: captureBoard.planning.teamId }
            : {})}
          defaultDestination="board"
          draftScope={`sprint-capture:${workspaceId}:${captureBoard.id}`}
          returnFocusRef={trigger}
          onClose={() => setCaptureId(null)}
          onConfirmed={(result) => {
            setCaptureId(null);
            setConfirmation(`${result.title} saved.`);
          }}
        />
      )}
    </section>
  );
}
