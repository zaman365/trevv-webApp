"use client";
import { SharedPlanningHub } from "./shared-planning-hub";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardDto, TeamDto, WorkItemDto } from "@founderhq/api-contract";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Flag,
  FolderKanban,
  ListTodo,
  MessageCircleMore,
  Plus,
  Users,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import { useLiveTeamActions } from "@/lib/use-live-team-actions";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";
import {
  canManageTeam,
  initials,
  presetLabels,
  teamSectionFromHash,
  teamSectionLabels,
  teamSections,
  teamWorkspaceRecords,
  type TeamSection,
} from "@/lib/team-workspace";
import { taskToday, type TaskPeriod } from "@/lib/task-views";
import {
  formatLiveDateOnly,
  workItemStatusLabel,
} from "@/lib/live-workflow-ui";
import { teamPlaybooks } from "@/lib/team-playbooks";
import { useWorkItemDetails } from "@/lib/use-work-item-details";
import { retainedKey } from "@/lib/live-work-view-helpers";
import { readAllPages } from "@/lib/read-all-pages";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveStateNotice } from "./live-state";
import { TeamManagementContent } from "./live-team-management";
import { LiveMyWork } from "./live-work-my-work";
import { PlanEditor, ProjectPlanningContent } from "./live-project-planning";
import {
  LiveQuickCaptureDialog,
  warmCreateDialog,
} from "./lazy-create-dialogs";
import { LiveTeamCommunication } from "./live-team-communication";
import styles from "./live-team-page.module.css";

const WorkItemDetail = lazy(() =>
  import("./live-board-experience").then((module) => ({
    default: module.WorkItemDetail,
  })),
);

export function LiveTeamPage({
  workspaceSlug,
  teamId,
}: {
  workspaceSlug: string;
  teamId: string;
}) {
  const session = useAppSession();
  const data = useLiveAppRecords();
  const cache = useQueryClient();
  const router = useRouter();
  const workspace = data.workspaces.find(
    (record) => record.slug === workspaceSlug,
  );
  const directory = useLiveTeamDirectory(workspace?.id);
  const actions = useLiveTeamActions(workspace?.id);
  const visibleDirectory = isLiveAccessLoss(directory.error)
    ? undefined
    : directory.data;
  const team = visibleDirectory?.teams.find((record) => record.id === teamId);
  const boardsQuery = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      workspace?.id ?? "",
    ),
    queryFn: ({ signal }) =>
      data.client.withSignal(signal).boards(workspace!.id),
    enabled: Boolean(workspace),
    staleTime: 30_000,
  });
  const boardsReady =
    Boolean(boardsQuery.data) && !isLiveAccessLoss(boardsQuery.error);
  const boards = useMemo(
    () => (boardsReady ? boardsQuery.data! : []),
    [boardsReady, boardsQuery.data],
  );
  const timezone = session.organization.timezone ?? "UTC";
  const [today, setToday] = useState(() => taskToday(timezone));
  const [section, setSection] = useState<TeamSection>("overview");
  const [communicationMode, setCommunicationMode] = useState<
    "conversation" | "topics"
  >("conversation");
  const [taskPeriod, setTaskPeriod] = useState<TaskPeriod>("open");
  const [taskOwner, setTaskOwner] = useState("");
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  const [captureType, setCaptureType] = useState<WorkItemDto["type"] | null>(
    null,
  );
  const [projectEditor, setProjectEditor] = useState<"new" | BoardDto | null>(
    null,
  );
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [directPending, setDirectPending] = useState("");
  const [directError, setDirectError] = useState<unknown>(null);
  const directKeys = useRef(new Map<string, string>());
  const creationTrigger = useRef<HTMLElement | null>(null);
  const pageActive = useRef(true);
  const detail = useWorkItemDetails(
    data.client,
    session.organization.id,
    workspace?.id,
    selectedItemId,
  );
  const records = useMemo(
    () =>
      team
        ? teamWorkspaceRecords(
            team,
            boardsReady ? data.items : [],
            boards,
            today,
          )
        : null,
    [team, data.items, boardsReady, boards, today],
  );
  const selected = isLiveAccessLoss(detail.error)
    ? undefined
    : records?.work.find((item) => item.id === selectedItemId);
  const canWrite = !["guest", "viewer"].includes(session.organization.role);
  const complete = boardsReady && data.recordsComplete;

  useEffect(() => {
    pageActive.current = true;
    return () => {
      pageActive.current = false;
    };
  }, []);
  useEffect(() => {
    const sync = () => setSection(teamSectionFromHash(window.location.hash));
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [teamId]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(taskToday(timezone)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, [timezone]);

  function go(next: TeamSection) {
    setSection(next);
    if (window.location.hash !== `#${next}`)
      window.history.pushState(null, "", `#${next}`);
  }
  function openCapture(type: WorkItemDto["type"], trigger: HTMLElement) {
    creationTrigger.current = trigger;
    setCaptureType(type);
  }
  function openProject(value: "new" | BoardDto, trigger: HTMLElement) {
    creationTrigger.current = trigger;
    setProjectEditor(value);
  }
  function showWork(period: TaskPeriod = "open", owner = "", blocked = false) {
    setTaskPeriod(period);
    setTaskOwner(owner);
    setOnlyBlocked(blocked);
    go("tasks");
  }
  async function openDirect(person: TeamDto["members"][number]["user"]) {
    if (!workspace || !canWrite || directPending) return;
    setDirectPending(person.id);
    setDirectError(null);
    try {
      const conversations = await readAllPages((cursor) =>
        data.client.conversations({
          workspaceId: workspace.id,
          limit: 100,
          ...(cursor ? { cursor } : {}),
        }),
      );
      const existing = conversations.find(
        (entry) =>
          entry.kind === "direct" &&
          entry.participants.length === 2 &&
          [person.id, session.user.id].every((id) =>
            entry.participants.some(
              (participant) => participant.user.id === id,
            ),
          ),
      );
      const conversation =
        existing ??
        (
          await data.client.createConversation(
            {
              workspaceId: workspace.id,
              title: `${session.user.name} & ${person.name}`.slice(0, 160),
              purpose: "",
              kind: "direct",
              visibility: "private",
              participantIds: [session.user.id, person.id],
              retentionDays: 365,
            },
            retainedKey(directKeys.current, person.id),
          )
        ).data;
      directKeys.current.delete(person.id);
      if (pageActive.current)
        router.push(
          `${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(conversation.id)}`,
        );
    } catch (error) {
      if (pageActive.current) setDirectError(error);
    } finally {
      if (pageActive.current) setDirectPending("");
    }
  }
  function savedPlan(board: BoardDto) {
    cache.setQueryData<BoardDto[]>(
      workspaceResourceKeys.boards(session.organization.id, workspace!.id),
      (current = []) => [
        ...current.filter((record) => record.id !== board.id),
        board,
      ],
    );
    void cache.invalidateQueries({
      queryKey: workspaceResourceKeys.boards(
        session.organization.id,
        workspace!.id,
      ),
    });
    setProjectEditor(null);
    setNotice(`“${board.name}” was saved.`);
    go("projects");
  }

  if (!workspace || !team || !records)
    return (
      <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
        <main className={styles.page}>
          <Link href={workspaceHref(workspaceSlug, "teams")}>
            <ArrowLeft size={15} /> Back to teams
          </Link>
          {directory.isPending && workspace ? (
            <LiveStateNotice kind="loading" title="Loading team workspace" />
          ) : directory.error ? (
            <LiveStateNotice
              {...presentLiveError(directory.error)}
              actions={
                <button type="button" onClick={() => void directory.refetch()}>
                  Retry team
                </button>
              }
            />
          ) : (
            <LiveStateNotice
              kind="permission-loss"
              title="Team not available"
              description="This team is outside your current workspace access or no longer exists."
            />
          )}
        </main>
      </WorkspaceFrame>
    );

  const lead = team.members.find((member) => member.role === "lead");
  const roomHref = team.room
    ? `${workspaceHref(workspaceSlug, "messages")}#${encodeURIComponent(team.room.conversationId)}`
    : null;
  const owner = team.members.find((member) => member.user.id === taskOwner);
  const filteredWork = records.work.filter(
    (item) =>
      (!taskOwner ||
        item.assignees.some((person) => person.id === taskOwner)) &&
      (!onlyBlocked || item.status === "blocked"),
  );
  const defaultBoard =
    records.projects.find((board) => !board.planning?.parentBoardId) ??
    records.projects[0];
  const date = (value?: string) =>
    value ? formatLiveDateOnly(value, timezone) : "No due date";
  const openItem = (item: WorkItemDto) => setSelectedItemId(item.id);
  const workList = (items: WorkItemDto[], empty: string, limit = 6) =>
    items.length ? (
      <ul className={styles.workList}>
        {items.slice(0, limit).map((item) => (
          <li key={item.id}>
            <button type="button" onClick={() => openItem(item)}>
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.assignees.map((person) => person.name).join(", ") ||
                    "Unassigned"}{" "}
                  · {date(item.dueDate)}
                </small>
              </span>
              <span className={styles.status}>
                {workItemStatusLabel(item.status)}
              </span>
              <ChevronRight size={15} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className={styles.empty}>{complete ? empty : "Loading team work…"}</p>
    );

  return (
    <WorkspaceFrame active="teams" workspaceSlug={workspaceSlug}>
      <main className={styles.page} data-testid="live-team-page">
        <nav className={styles.breadcrumb} aria-label="Breadcrumb">
          <Link href={workspaceHref(workspaceSlug)}>{workspace.name}</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <Link href={workspaceHref(workspaceSlug, "teams")}>Teams</Link>
          <ChevronRight size={13} aria-hidden="true" />
          <span aria-current="page">{team.name}</span>
        </nav>
        <header className={styles.hero}>
          <div className={styles.identity}>
            <div className={styles.mark} aria-hidden="true">
              {initials(team.name)}
            </div>
            <div>
              <p className={styles.eyebrow}>{presetLabels[team.preset]} team</p>
              <h1>{team.name}</h1>
              <p className={styles.purpose}>
                {team.purpose || teamPlaybooks[team.preset].outcome}
              </p>
              <div className={styles.meta}>
                <button type="button" onClick={() => go("people")}>
                  <Users size={14} /> {team.members.length}{" "}
                  {team.members.length === 1 ? "member" : "members"}
                </button>
                <span>Lead: {lead?.user.name ?? "Not assigned"}</span>
                <span>
                  {directory.isFetching ? "Refreshing team…" : "Team workspace"}
                </span>
              </div>
            </div>
          </div>
          <div className={styles.heroActions}>
            {canWrite ? (
              <button
                type="button"
                className={styles.primary}
                onClick={(event) => openCapture("task", event.currentTarget)}
                onPointerEnter={() => warmCreateDialog("live-capture")}
                onFocus={() => warmCreateDialog("live-capture")}
              >
                <Plus size={16} /> New task
              </button>
            ) : null}
            {canWrite ? (
              <button
                type="button"
                onClick={(event) => openProject("new", event.currentTarget)}
              >
                <FolderKanban size={16} /> New project
              </button>
            ) : null}
            {roomHref ? (
              <Link href={roomHref}>
                <MessageCircleMore size={16} /> Open team room{" "}
                <ArrowUpRight size={14} />
              </Link>
            ) : (
              <button type="button" onClick={() => go("people")}>
                <Users size={16} /> View membership
              </button>
            )}
          </div>
        </header>
        <nav className={styles.navigation} aria-label="Team page sections">
          {teamSections.map((key) => (
            <Link
              key={key}
              href={teamHref(workspaceSlug, team.id, key)}
              aria-current={section === key ? "page" : undefined}
              onClick={(event) => {
                if (
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey ||
                  event.button !== 0
                )
                  return;
                event.preventDefault();
                go(key);
              }}
            >
              {teamSectionLabels[key]}
            </Link>
          ))}
        </nav>
        {directory.error ? (
          <LiveStateNotice
            {...presentLiveError(directory.error)}
            actions={
              <button type="button" onClick={() => void directory.refetch()}>
                Refresh team
              </button>
            }
          />
        ) : null}
        {boardsQuery.error ? (
          <LiveStateNotice
            {...presentLiveError(boardsQuery.error)}
            actions={
              <button type="button" onClick={() => void boardsQuery.refetch()}>
                Retry team projects
              </button>
            }
          />
        ) : null}
        {notice || actions.savedMessage ? (
          <LiveStateNotice
            kind="saved"
            title={notice || actions.savedMessage}
          />
        ) : null}
        {directError ? (
          <LiveStateNotice {...presentLiveError(directError)} />
        ) : null}
        {section === "overview" ? (
          <>
            <section className={styles.metrics} aria-label="Team progress">
              {[
                {
                  label: "Open work",
                  value: records.open.length,
                  Icon: ListTodo,
                  action: () => showWork(),
                },
                {
                  label: "Overdue",
                  value: records.overdue.length,
                  Icon: CalendarDays,
                  action: () => showWork("overdue"),
                },
                {
                  label: "Blocked",
                  value: records.blocked.length,
                  Icon: CircleAlert,
                  action: () => showWork("open", "", true),
                },
                {
                  label: "Completed",
                  value: records.completed.length,
                  Icon: CheckCircle2,
                  action: () => showWork("completed"),
                },
                {
                  label: "Active plans",
                  value: records.activeProjects.length,
                  Icon: FolderKanban,
                  action: () => go("projects"),
                },
              ].map(({ label, value, Icon, action }) => (
                <button type="button" key={label} onClick={action}>
                  <span>
                    <Icon size={17} aria-hidden="true" />
                    {label}
                  </span>
                  <strong>{complete ? value : "…"}</strong>
                  <small>
                    View details <ChevronRight size={13} aria-hidden="true" />
                  </small>
                </button>
              ))}
            </section>
            <SharedPlanningHub
              workspaceId={team.workspaceId}
              workspaceSlug={workspaceSlug}
              teamId={team.id}
              compact
            />
            <div className={styles.overviewGrid}>
              <section className={styles.panel} aria-label="Needs attention">
                <header>
                  <div>
                    <p className={styles.eyebrow}>Focus for the team</p>
                    <h2>Needs attention</h2>
                  </div>
                  <button type="button" onClick={() => showWork()}>
                    All work <ArrowUpRight size={14} />
                  </button>
                </header>
                {workList(
                  records.priority,
                  "Nothing urgent, blocked or overdue. Keep the next milestone moving.",
                )}
                {records.work.length === 0 && complete && canWrite ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={(event) =>
                      openCapture("task", event.currentTarget)
                    }
                  >
                    Create the first task
                  </button>
                ) : null}
              </section>
              <section className={styles.panel} aria-label="Team communication">
                <header>
                  <div>
                    <p className={styles.eyebrow}>Keep everyone connected</p>
                    <h2>Team communication</h2>
                  </div>
                  <MessageCircleMore size={21} />
                </header>
                <p>
                  {team.room
                    ? "Share updates, ask questions and make decisions together. Keep longer discussions in named topics."
                    : "This room is private to team members. Review membership to take part."}
                </p>
                {team.room ? (
                  <>
                    <div className={styles.roomStatus}>
                      <strong>{team.room.unreadCount}</strong>
                      <span>
                        unread{" "}
                        {team.room.unreadCount === 1 ? "message" : "messages"}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() => {
                        setCommunicationMode("conversation");
                        go("communication");
                      }}
                    >
                      Open conversation <ChevronRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCommunicationMode("topics");
                        go("communication");
                      }}
                    >
                      Browse team topics
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => go("people")}>
                    View people and access
                  </button>
                )}
              </section>
              <section
                className={styles.panel}
                aria-label="Upcoming milestones and deadlines"
              >
                <header>
                  <div>
                    <p className={styles.eyebrow}>Delivery outlook</p>
                    <h2>Upcoming milestones & deadlines</h2>
                  </div>
                  <button type="button" onClick={() => go("projects")}>
                    Plans <ArrowUpRight size={14} />
                  </button>
                </header>
                {workList(
                  records.upcoming,
                  "No upcoming deadlines. Add dates to give the team a shared delivery plan.",
                )}
              </section>
              <section
                className={styles.panel}
                aria-label="Team workload overview"
              >
                <header>
                  <div>
                    <p className={styles.eyebrow}>People and ownership</p>
                    <h2>Team workload</h2>
                  </div>
                  <button type="button" onClick={() => go("people")}>
                    All people <ArrowUpRight size={14} />
                  </button>
                </header>
                {records.people.length ? (
                  <ul className={styles.peopleList}>
                    {records.people
                      .slice(0, 5)
                      .map(({ member, assigned, overdue }) => (
                        <li key={member.user.id}>
                          <span className={styles.avatar}>
                            {initials(member.user.name)}
                          </span>
                          <span>
                            <strong>{member.user.name}</strong>
                            <small>
                              {member.role === "lead"
                                ? "Team lead"
                                : "Team member"}
                            </small>
                          </span>
                          <button
                            type="button"
                            onClick={() => showWork("open", member.user.id)}
                          >
                            {complete ? assigned.length : "…"} open
                            {overdue.length
                              ? ` · ${overdue.length} overdue`
                              : ""}
                            <ChevronRight size={14} />
                          </button>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>
                    Add people to build the team and assign work.
                  </p>
                )}
              </section>
              <section
                className={`${styles.panel} ${styles.widePanel}`}
                aria-label="Recently updated team work"
              >
                <header>
                  <div>
                    <p className={styles.eyebrow}>Stay informed</p>
                    <h2>Recently updated work</h2>
                  </div>
                  <button type="button" onClick={() => showWork("all")}>
                    View all <ArrowUpRight size={14} />
                  </button>
                </header>
                {workList(
                  records.recent,
                  "Team work and updates will appear here as you get started.",
                )}
              </section>
            </div>
          </>
        ) : null}
        {section === "tasks" ? (
          <section className={styles.section} aria-label="Team tasks">
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Plan, assign, deliver</p>
                <h2>
                  {owner
                    ? `${owner.user.name}'s team work`
                    : onlyBlocked
                      ? "Blocked team work"
                      : "Team tasks"}
                </h2>
                <p>
                  Work owned by {team.name}, plus members’ work without another
                  team owner.
                </p>
              </div>
              <div className={styles.actions}>
                {taskOwner || onlyBlocked ? (
                  <button type="button" onClick={() => showWork()}>
                    Show all team work
                  </button>
                ) : null}
                {canWrite ? (
                  <button
                    type="button"
                    className={styles.primary}
                    onClick={(event) =>
                      openCapture("task", event.currentTarget)
                    }
                  >
                    <Plus size={15} /> Add task
                  </button>
                ) : null}
              </div>
            </header>
            {boardsReady ? (
              <LiveMyWork
                key={`${taskPeriod}:${taskOwner}:${onlyBlocked}`}
                items={filteredWork}
                workspaceSlug={workspaceSlug}
                assignedToMe={false}
                title="Team work"
                initialPeriod={taskPeriod}
                onOpen={openItem}
              />
            ) : (
              <LiveStateNotice
                kind="loading"
                title="Loading team work and projects"
              />
            )}
          </section>
        ) : null}
        {section === "projects" ? (
          <section
            className={styles.section}
            aria-label="Team projects and milestones"
          >
            <header className={styles.sectionHeader}>
              <div>
                <p className={styles.eyebrow}>Goals and delivery</p>
                <h2>Projects & milestones</h2>
                <p>
                  Connect the team’s goals to projects, sprints and dated
                  milestones.
                </p>
              </div>
              {canWrite ? (
                <button
                  type="button"
                  onClick={(event) =>
                    openCapture("milestone", event.currentTarget)
                  }
                >
                  <Flag size={15} /> Add milestone
                </button>
              ) : null}
            </header>
            <ProjectPlanningContent
              workspaceId={workspace.id}
              workspaceSlug={workspaceSlug}
              teamId={team.id}
            />
            <section className={styles.panel} aria-label="Team milestones">
              <header>
                <h2>Milestones</h2>
                {canWrite && defaultBoard ? (
                  <button
                    type="button"
                    onClick={(event) =>
                      openProject(defaultBoard, event.currentTarget)
                    }
                  >
                    Plan a sprint / cycle
                  </button>
                ) : null}
              </header>
              {workList(
                records.milestones,
                "No milestones yet. Add a dated checkpoint to a team project.",
                records.milestones.length,
              )}
            </section>
          </section>
        ) : null}
        <div hidden={section !== "communication"}>
          <LiveTeamCommunication
            key={team.id}
            team={team}
            workspaceSlug={workspaceSlug}
            active={section === "communication"}
            mode={communicationMode}
            onModeChange={setCommunicationMode}
          />
        </div>
        <div
          hidden={section !== "people" && section !== "settings"}
          className={styles.section}
        >
          <header className={styles.sectionHeader}>
            <div>
              <p className={styles.eyebrow}>
                {section === "settings"
                  ? "Team configuration"
                  : "People and responsibility"}
              </p>
              <h2>
                {section === "settings" ? "Team settings" : "People & workload"}
              </h2>
              <p>
                {section === "settings"
                  ? "Keep the team's purpose, department and tools up to date."
                  : "Manage membership, invite collaborators, and see who owns the work."}
              </p>
            </div>
          </header>
          <TeamManagementContent
            key={team.id}
            section={section === "settings" ? "settings" : "people"}
            team={team}
            workspaceSlug={workspaceSlug}
            availableMembers={visibleDirectory?.availableMembers ?? []}
            canManage={canManageTeam(
              team,
              session.user.id,
              session.managedWorkspaceIds,
            )}
            pending={actions.pending}
            error={actions.error}
            onRefresh={() => {
              actions.setError(null);
              void directory.refetch();
            }}
            onSetMember={(userId, role) =>
              actions
                .runTeamMutation(
                  () =>
                    actions.client.setTeamMember(
                      team.id,
                      userId,
                      { role },
                      team.version,
                      crypto.randomUUID(),
                    ),
                  "Team membership and room access were updated.",
                )
                .then(Boolean)
            }
            onRemoveMember={(userId) =>
              actions
                .runTeamMutation(
                  () =>
                    actions.client.removeTeamMember(
                      team.id,
                      userId,
                      team.version,
                      crypto.randomUUID(),
                    ),
                  "Team membership and room access were updated.",
                )
                .then(Boolean)
            }
            onUpdate={(input, version) =>
              actions
                .runTeamMutation(
                  () =>
                    actions.client.updateTeam(
                      team.id,
                      input,
                      version,
                      crypto.randomUUID(),
                    ),
                  "Team settings were saved.",
                )
                .then(Boolean)
            }
            memberExtras={(member) => {
              const person = records.people.find(
                (entry) => entry.member.user.id === member.user.id,
              )!;
              return (
                <>
                  <span>
                    {complete
                      ? `${person.assigned.length} open · ${person.overdue.length} overdue · ${person.blocked.length} blocked`
                      : "Loading workload…"}
                  </span>
                  <button
                    type="button"
                    onClick={() => showWork("open", member.user.id)}
                  >
                    View work for {member.user.name}
                  </button>
                  {canWrite && member.user.id !== session.user.id ? (
                    <button
                      type="button"
                      disabled={Boolean(directPending)}
                      onClick={() => void openDirect(member.user)}
                    >
                      <MessageCircleMore size={14} />
                      {directPending === member.user.id
                        ? "Opening…"
                        : `Message ${member.user.name}`}
                    </button>
                  ) : null}
                </>
              );
            }}
          />
        </div>
        {captureType ? (
          <LiveQuickCaptureDialog
            workspaceId={workspace.id}
            workspaceSlug={workspaceSlug}
            defaultTeamId={team.id}
            returnFocusRef={creationTrigger}
            {...(defaultBoard ? { defaultBoardId: defaultBoard.id } : {})}
            defaultType={captureType}
            defaultAssigneeId={
              team.members.some((member) => member.user.id === session.user.id)
                ? session.user.id
                : ""
            }
            onClose={() => setCaptureType(null)}
            onConfirmed={(result) => {
              setCaptureType(null);
              setNotice(`“${result.title}” was saved.`);
              if (result.destination === "board") {
                setSelectedItemId(result.recordId);
                showWork("all");
              }
            }}
          />
        ) : null}
        {projectEditor ? (
          <PlanEditor
            workspaceId={workspace.id}
            boards={boards}
            teams={visibleDirectory?.teams ?? []}
            initialTeamId={team.id}
            returnFocusRef={creationTrigger}
            {...(projectEditor === "new" ? {} : { parentBoard: projectEditor })}
            onClose={() => setProjectEditor(null)}
            onSaved={savedPlan}
          />
        ) : null}
        {selectedItemId && detail.error ? (
          <LiveStateNotice
            {...presentLiveError(detail.error)}
            actions={
              <button type="button" onClick={() => void detail.refetch()}>
                Retry task details
              </button>
            }
          />
        ) : null}
        {selected ? (
          <Suspense
            fallback={
              <LiveStateNotice kind="loading" title="Opening task details" />
            }
          >
            <WorkItemDetail
              key={selected.id}
              item={selected}
              history={detail.data?.history ?? []}
              evidence={detail.data?.evidence ?? []}
              loading={detail.isPending}
              timezone={timezone}
              onClose={() => setSelectedItemId(null)}
              onConfirmed={async (next, confirmation) => {
                await data.applyConfirmedItem(next);
                setNotice(confirmation);
                void data.refresh({ backgroundRecords: true });
                void detail.refetch();
              }}
            />
          </Suspense>
        ) : null}
      </main>
    </WorkspaceFrame>
  );
}
