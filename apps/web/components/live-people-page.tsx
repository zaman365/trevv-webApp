"use client";
import { WorkspacePageSections } from "./workspace-page-sections";
import sectionStyles from "./page-sections.module.css";

import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import type { WorkItemDto } from "@founderhq/api-contract";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Mail,
  MessageCircleMore,
  Plus,
  Users,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { useAppSession } from "@/lib/app-session-context";
import { useLiveAppRecords } from "@/lib/live-app-data";
import { useLiveTeamDirectory } from "@/lib/live-collaboration";
import { useFloatingChat } from "@/lib/floating-chat-context";
import { isLiveAccessLoss, presentLiveError } from "@/lib/live-errors";
import {
  personEmailHref,
  personHref,
  personWorkspaceRecords,
} from "@/lib/people-workspace";
import { initials } from "@/lib/team-workspace";
import { taskToday } from "@/lib/task-views";
import {
  formatLiveDateOnly,
  workItemStatusLabel,
} from "@/lib/live-workflow-ui";
import { useWorkItemDetails } from "@/lib/use-work-item-details";
import { workspaceResourceKeys } from "@/lib/workspace-resource-keys";
import { teamHref, workspaceHref } from "@/lib/workspace-routes";
import { WorkspaceFrame } from "./workspace-frame";
import { LiveStateNotice } from "./live-state";
import { PersonIdentity } from "./person-identity";
import { LiveQuickCaptureDialog } from "./lazy-create-dialogs";
import styles from "./people-workspace.module.css";

const WorkItemDetail = lazy(() =>
  import("./live-board-experience").then((module) => ({
    default: module.WorkItemDetail,
  })),
);
const sections = ["overview", "work", "projects", "teams", "activity"] as const;
type Section = (typeof sections)[number];
type WorkFilter = "all" | "open" | "overdue" | "blocked" | "done";

export function LivePeoplePage({
  workspaceSlug,
  userId,
  embedded = false,
}: {
  workspaceSlug: string;
  userId?: string;
  embedded?: boolean;
}) {
  const Frame = embedded ? EmbeddedPeopleFrame : WorkspaceFrame;
  const Content = embedded ? "div" : "main";
  const Heading = embedded ? "h3" : "h1";
  const session = useAppSession();
  const data = useLiveAppRecords();
  const chat = useFloatingChat();
  const workspace = data.workspaces.find(
    (entry) => entry.slug === workspaceSlug,
  );
  const directory = useLiveTeamDirectory(workspace?.id);
  const boardsQuery = useQuery({
    queryKey: workspaceResourceKeys.boards(
      session.organization.id,
      workspace?.id ?? "",
    ),
    queryFn: ({ signal }) =>
      data.client.withSignal(signal).boards(workspace!.id),
    enabled: Boolean(workspace && userId),
    staleTime: 30_000,
  });
  const accessLost = data.accessLost || isLiveAccessLoss(directory.error);
  const members = accessLost ? [] : (directory.data?.availableMembers ?? []);
  const teams = accessLost ? [] : (directory.data?.teams ?? []);
  const person = members.find((entry) => entry.id === userId);
  const timezone = session.organization.timezone ?? "UTC";
  const [today, setToday] = useState(() => taskToday(timezone));
  const [section, setSection] = useState<Section>("overview");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [workFilter, setWorkFilter] = useState<WorkFilter>("open");
  const [capture, setCapture] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const captureTrigger = useRef<HTMLElement | null>(null);
  const records =
    person && workspace
      ? personWorkspaceRecords(
          person.id,
          workspace.id,
          data.items,
          !isLiveAccessLoss(boardsQuery.error) ? (boardsQuery.data ?? []) : [],
          teams,
          today,
        )
      : null;
  const selected = records?.work.find((entry) => entry.id === selectedId);
  const detail = useWorkItemDetails(
    data.client,
    session.organization.id,
    workspace?.id,
    selected?.id ?? null,
  );
  const canWrite = !["guest", "viewer"].includes(session.organization.role);
  const complete =
    data.recordsComplete &&
    (!data.recordWorkspaceId || data.recordWorkspaceId === workspace?.id);
  const queryError = directory.error ?? (userId ? boardsQuery.error : null);
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());

  const visibleMembers = members.filter(
    (entry) =>
      matches(`${entry.name} ${entry.email}`) &&
      (!teamFilter ||
        (teamFilter === "unassigned"
          ? !teams.some((team) =>
              team.members.some((member) => member.user.id === entry.id),
            )
          : teams.some(
              (team) =>
                team.id === teamFilter &&
                team.members.some((member) => member.user.id === entry.id),
            ))),
  );

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.slice(1);
      setSection(
        sections.includes(hash as Section) ? (hash as Section) : "overview",
      );
    };
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, [userId]);
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(taskToday(timezone)),
      60_000,
    );
    return () => window.clearInterval(timer);
  }, [timezone]);
  function go(next: Section) {
    setSection(next);
    window.history.pushState(null, "", `#${next}`);
  }
  function showWork(filter: WorkFilter) {
    setWorkFilter(filter);
    setSearch("");
    go("work");
  }
  function taskList(items: WorkItemDto[], empty: string) {
    return items.length ? (
      <ul className={styles.list}>
        {items.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              className={styles.workButton}
              onClick={() => setSelectedId(entry.id)}
            >
              <span>
                <strong>{entry.title}</strong>
                <small>
                  {workItemStatusLabel(entry.status)} · {entry.priority}
                  {entry.dueDate
                    ? ` · Due ${formatLiveDateOnly(entry.dueDate, timezone)}`
                    : " · No due date"}
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p>{complete ? empty : "Loading assigned work…"}</p>
    );
  }

  return (
    <Frame active="teams" workspaceSlug={workspaceSlug}>
      <Content className={styles.main}>
        <div className={styles.actions}>
          <Link
            href={
              userId
                ? personHref(workspaceSlug)
                : workspaceHref(workspaceSlug, "teams")
            }
          >
            <ArrowLeft size={16} />
            {userId ? "All people" : "Teams and people"}
          </Link>
        </div>
        {queryError ? (
          <LiveStateNotice
            {...presentLiveError(queryError)}
            actions={
              <button
                type="button"
                onClick={() => {
                  void directory.refetch();
                  if (userId) void boardsQuery.refetch();
                }}
              >
                Refresh people
              </button>
            }
          />
        ) : null}
        {notice ? <p role="status">{notice}</p> : null}
        {directory.isLoading ? (
          <LiveStateNotice kind="loading" title="Loading people" />
        ) : null}
        {userId ? (
          person && records && workspace ? (
            <>
              <header className={styles.hero}>
                <div className={styles.heroIdentity}>
                  <span className={styles.avatar}>{initials(person.name)}</span>
                  <div>
                    <span className={styles.eyebrow}>
                      {workspace.name} · Person
                    </span>
                    <Heading>
                      {person.name}
                      {person.id === session.user.id ? " (you)" : ""}
                    </Heading>
                    <p>
                      {person.organizationRole.replaceAll("_", " ")} ·{" "}
                      {records.memberships.length}{" "}
                      {records.memberships.length === 1 ? "team" : "teams"}
                    </p>
                    <a
                      className={styles.contact}
                      href={personEmailHref(person.email)}
                    >
                      <Mail size={15} />
                      {person.email}
                    </a>
                  </div>
                </div>
                <div className={styles.actions}>
                  {person.id !== session.user.id && chat ? (
                    <button
                      type="button"
                      className={styles.primary}
                      onClick={() =>
                        chat.openChat({ workspaceSlug, personId: person.id })
                      }
                    >
                      <MessageCircleMore size={16} />
                      Start chat
                    </button>
                  ) : null}
                  <a
                    href={personEmailHref(
                      person.email,
                      `Working together in ${workspace.name}`,
                    )}
                  >
                    <Mail size={16} />
                    Write email
                  </a>
                  {canWrite ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        captureTrigger.current = event.currentTarget;
                        setCapture(true);
                      }}
                    >
                      <Plus size={16} />
                      Assign task
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${window.location.origin}${personHref(workspaceSlug, person.id)}`,
                        );
                        setCopied(true);
                        setNotice("Profile link copied.");
                      } catch {
                        setNotice(
                          "The profile link could not be copied. You can copy this page’s address instead.",
                        );
                      }
                    }}
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </header>
              <nav className={sectionStyles.tabs} aria-label="Person sections">
                {sections.map((entry) => (
                  <a
                    key={entry}
                    href={`#${entry}`}
                    aria-current={section === entry ? "page" : undefined}
                    onClick={(event) => {
                      event.preventDefault();
                      go(entry);
                    }}
                  >
                    {entry[0]!.toUpperCase() + entry.slice(1)}
                  </a>
                ))}
              </nav>
              <div
                className={styles.metrics}
                aria-label="Assigned work summary"
              >
                {(
                  [
                    {
                      label: "Open tasks",
                      value: records.open.length,
                      filter: "open",
                    },
                    {
                      label: "Overdue",
                      value: records.overdue.length,
                      filter: "overdue",
                    },
                    {
                      label: "Blocked",
                      value: records.blocked.length,
                      filter: "blocked",
                    },
                    {
                      label: "Completed",
                      value: records.completed.length,
                      filter: "done",
                    },
                  ] as const
                ).map((metric) => (
                  <button
                    type="button"
                    key={metric.label}
                    onClick={() => showWork(metric.filter)}
                  >
                    <strong>{complete ? metric.value : "…"}</strong>
                    <span>{metric.label}</span>
                  </button>
                ))}
              </div>
              {section === "overview" ? (
                <div className={styles.grid}>
                  <section className={styles.panel}>
                    <header>
                      <h2>About this person</h2>
                    </header>
                    <dl className={styles.facts}>
                      <dt>Workspace</dt>
                      <dd>{workspace.name}</dd>
                      <dt>Role</dt>
                      <dd>{person.organizationRole.replaceAll("_", " ")}</dd>
                      <dt>Email</dt>
                      <dd>
                        <a href={personEmailHref(person.email)}>
                          {person.email}
                        </a>
                      </dd>
                      <dt>Team roles</dt>
                      <dd>
                        {records.memberships.length
                          ? records.memberships.map((team) => (
                              <div key={team.id}>
                                <Link href={teamHref(workspaceSlug, team.id)}>
                                  {team.name}
                                </Link>{" "}
                                ·{" "}
                                {
                                  team.members.find(
                                    (member) => member.user.id === person.id,
                                  )?.role
                                }
                              </div>
                            ))
                          : "No team assigned"}
                      </dd>
                    </dl>
                    {person.id === session.user.id ? (
                      <div className={styles.actions}>
                        <Link href="/app/account/sessions">
                          Account and security
                          <ArrowUpRight size={15} />
                        </Link>
                        <Link href="/app/account/privacy">
                          Privacy settings
                          <ArrowUpRight size={15} />
                        </Link>
                      </div>
                    ) : null}
                  </section>
                  <section className={styles.panel}>
                    <header>
                      <h2>Upcoming and overdue work</h2>
                      <a
                        href="#work"
                        onClick={(event) => {
                          event.preventDefault();
                          showWork("open");
                        }}
                      >
                        View all work
                      </a>
                    </header>
                    {taskList(
                      records.upcoming.slice(0, 5),
                      "No assigned work with a deadline.",
                    )}
                  </section>
                  <section className={styles.panel}>
                    <header>
                      <h2>Teams and communication</h2>
                      <a
                        href="#teams"
                        onClick={(event) => {
                          event.preventDefault();
                          go("teams");
                        }}
                      >
                        View teams
                      </a>
                    </header>
                    <p>
                      Start a private conversation, discuss work with a team, or
                      draft an email with the details you need.
                    </p>
                    <div className={styles.actions}>
                      {records.memberships
                        .filter((team) => team.room)
                        .map((team) => (
                          <button
                            type="button"
                            key={team.id}
                            onClick={() =>
                              chat?.openChat({
                                workspaceSlug,
                                conversationId: team.room!.conversationId,
                              })
                            }
                            disabled={!chat}
                          >
                            <MessageCircleMore size={15} />
                            {team.name}
                          </button>
                        ))}
                    </div>
                  </section>
                  <section className={styles.panel}>
                    <header>
                      <h2>Recent work activity</h2>
                      <a
                        href="#activity"
                        onClick={(event) => {
                          event.preventDefault();
                          go("activity");
                        }}
                      >
                        View activity
                      </a>
                    </header>
                    {taskList(
                      records.activity.slice(0, 4),
                      "No assigned work activity yet.",
                    )}
                  </section>
                </div>
              ) : null}
              {section === "work" ? (
                <section className={styles.panel}>
                  <header>
                    <h2>Assigned work</h2>
                    <Link href={workspaceHref(workspaceSlug, "my-work")}>
                      Workspace workload
                      <ArrowUpRight size={15} />
                    </Link>
                  </header>
                  <div className={styles.filters}>
                    <label>
                      Search work
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Task title or context"
                      />
                    </label>
                    <label>
                      Status
                      <select
                        value={workFilter}
                        onChange={(event) =>
                          setWorkFilter(event.target.value as WorkFilter)
                        }
                      >
                        <option value="all">All work</option>
                        <option value="open">Open</option>
                        <option value="overdue">Overdue</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Completed</option>
                      </select>
                    </label>
                  </div>
                  {taskList(
                    (workFilter === "all"
                      ? records.work
                      : workFilter === "open"
                        ? records.open
                        : workFilter === "overdue"
                          ? records.overdue
                          : workFilter === "blocked"
                            ? records.blocked
                            : records.completed
                    ).filter((entry) =>
                      matches(`${entry.title} ${entry.description ?? ""}`),
                    ),
                    "No assigned tasks match these filters.",
                  )}
                </section>
              ) : null}
              {section === "projects" ? (
                <section className={styles.panel}>
                  <header>
                    <h2>Projects with assigned work</h2>
                    <Link href={workspaceHref(workspaceSlug, "planning")}>
                      All plans and projects
                      <ArrowUpRight size={15} />
                    </Link>
                  </header>
                  <p>Projects where {person.name} has assigned tasks.</p>
                  {boardsQuery.isLoading ? (
                    <p role="status">Loading projects…</p>
                  ) : records.projects.length ? (
                    <ul className={styles.list}>
                      {records.projects.map((board) => {
                        const work = records.work.filter(
                          (entry) => entry.boardId === board.id,
                        );
                        return (
                          <li key={board.id}>
                            <h3>
                              <Link
                                href={`${workspaceHref(workspaceSlug)}/boards/${encodeURIComponent(board.id)}`}
                              >
                                {board.name}
                                <ArrowUpRight size={14} />
                              </Link>
                            </h3>
                            <p>
                              {board.description ||
                                "No project description yet."}
                            </p>
                            <small>
                              {
                                work.filter((entry) => entry.status !== "done")
                                  .length
                              }{" "}
                              open ·{" "}
                              {
                                work.filter((entry) => entry.status === "done")
                                  .length
                              }{" "}
                              completed
                            </small>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p>
                      {complete
                        ? "No projects with assigned tasks yet."
                        : "Loading assigned projects…"}
                    </p>
                  )}
                </section>
              ) : null}
              {section === "teams" ? (
                <section className={styles.panel}>
                  <header>
                    <h2>Team memberships</h2>
                    <Link href={workspaceHref(workspaceSlug, "teams")}>
                      Manage teams
                      <ArrowUpRight size={15} />
                    </Link>
                  </header>
                  {records.memberships.length ? (
                    <ul className={styles.list}>
                      {records.memberships.map((team) => (
                        <li key={team.id}>
                          <h3>
                            <Link href={teamHref(workspaceSlug, team.id)}>
                              {team.name}
                            </Link>
                          </h3>
                          <small>
                            {
                              team.members.find(
                                (member) => member.user.id === person.id,
                              )?.role
                            }{" "}
                            · {team.members.length} members
                          </small>
                          <p>
                            {team.purpose || "No team purpose has been added."}
                          </p>
                          <div className={styles.actions}>
                            <Link
                              href={teamHref(workspaceSlug, team.id, "people")}
                            >
                              <Users size={15} />
                              Team details
                            </Link>
                            {team.room && chat ? (
                              <button
                                type="button"
                                onClick={() =>
                                  chat.openChat({
                                    workspaceSlug,
                                    conversationId: team.room!.conversationId,
                                  })
                                }
                              >
                                <MessageCircleMore size={15} />
                                Open team chat
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>This person has not been assigned to a team.</p>
                  )}
                </section>
              ) : null}
              {section === "activity" ? (
                <section className={styles.panel}>
                  <header>
                    <h2>Recent work activity</h2>
                  </header>
                  <p>Latest changes to work assigned to {person.name}.</p>
                  {records.activity.length ? (
                    <ul className={styles.list}>
                      {records.activity.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            className={styles.workButton}
                            onClick={() => setSelectedId(entry.id)}
                          >
                            <span>
                              <strong>{entry.title}</strong>
                              <small>
                                {workItemStatusLabel(entry.status)} · Updated{" "}
                                {new Intl.DateTimeFormat("en", {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                  timeZone: timezone,
                                }).format(new Date(entry.updatedAt))}
                              </small>
                            </span>
                            <ChevronRight size={16} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      {complete
                        ? "No assigned work activity yet."
                        : "Loading activity…"}
                    </p>
                  )}
                </section>
              ) : null}
              {capture ? (
                <LiveQuickCaptureDialog
                  workspaceId={workspace.id}
                  workspaceSlug={workspaceSlug}
                  defaultAssigneeId={person.id}
                  draftScope={`person:${workspace.id}:${person.id}`}
                  returnFocusRef={captureTrigger}
                  onClose={() => setCapture(false)}
                  onConfirmed={(result) => {
                    setCapture(false);
                    setNotice(`“${result.title}” was saved.`);
                    void data.refresh({ backgroundRecords: true });
                  }}
                />
              ) : null}
              {selected && !isLiveAccessLoss(detail.error) ? (
                <Suspense
                  fallback={
                    <LiveStateNotice
                      kind="loading"
                      title="Opening task details"
                    />
                  }
                >
                  <WorkItemDetail
                    key={selected.id}
                    item={selected}
                    history={detail.data?.history ?? []}
                    evidence={detail.data?.evidence ?? []}
                    loading={detail.isPending}
                    timezone={timezone}
                    onClose={() => setSelectedId(null)}
                    onConfirmed={async (next, confirmation) => {
                      await data.applyConfirmedItem(next);
                      setNotice(confirmation);
                      void data.refresh({ backgroundRecords: true });
                      void detail.refetch();
                    }}
                  />
                </Suspense>
              ) : null}
              {selectedId && detail.error ? (
                <LiveStateNotice
                  {...presentLiveError(detail.error)}
                  actions={
                    <button type="button" onClick={() => void detail.refetch()}>
                      Retry task details
                    </button>
                  }
                />
              ) : null}
            </>
          ) : !directory.isLoading ? (
            <section className={styles.panel}>
              <Heading>Person unavailable</Heading>
              <p>This person is not available in this workspace directory.</p>
            </section>
          ) : null
        ) : (
          <>
            <header className={styles.hero}>
              <div>
                <span className={styles.eyebrow}>
                  {workspace?.name} · Directory
                </span>
                <Heading>People</Heading>
                <p>
                  Find a teammate, see their work, and start a conversation.
                </p>
              </div>
              <div className={styles.actions}>
                <Link href={workspaceHref(workspaceSlug, "teams")}>
                  <Users size={16} />
                  Teams and invitations
                </Link>
                {chat ? (
                  <button
                    type="button"
                    onClick={() => chat.openChat({ workspaceSlug })}
                  >
                    <MessageCircleMore size={16} />
                    Open chats
                  </button>
                ) : null}
              </div>
            </header>
            <WorkspacePageSections page="people" workspaceSlug={workspaceSlug}>
              <div className={styles.filters}>
                <label>
                  Search people
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <label>
                  Team
                  <select
                    value={teamFilter}
                    onChange={(event) => setTeamFilter(event.target.value)}
                  >
                    <option value="">All teams</option>
                    <option value="unassigned">No team assigned</option>
                    {teams.map((team) => (
                      <option value={team.id} key={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.directory}>
                {visibleMembers.map((entry) => (
                  <article key={entry.id} className={styles.panel}>
                    <header className={styles.cardHeader}>
                      <span className={styles.avatar}>
                        {initials(entry.name)}
                      </span>
                      <div>
                        <strong>
                          <PersonIdentity
                            workspaceSlug={workspaceSlug}
                            userId={entry.id}
                            name={entry.name}
                          />
                        </strong>
                        <small>
                          {entry.organizationRole.replaceAll("_", " ")}
                          {entry.id === session.user.id ? " · You" : ""}
                        </small>
                      </div>
                    </header>
                    <a
                      className={styles.contact}
                      href={personEmailHref(entry.email)}
                    >
                      <Mail size={14} />
                      {entry.email}
                    </a>
                    <div className={styles.pills}>
                      {teams
                        .filter((team) =>
                          team.members.some(
                            (member) => member.user.id === entry.id,
                          ),
                        )
                        .map((team) => (
                          <Link
                            key={team.id}
                            href={teamHref(workspaceSlug, team.id)}
                          >
                            {team.name}
                          </Link>
                        ))}
                    </div>
                    <div className={styles.actions}>
                      <Link href={personHref(workspaceSlug, entry.id)}>
                        View profile
                        <ArrowUpRight size={15} />
                      </Link>
                      {entry.id !== session.user.id && chat ? (
                        <button
                          type="button"
                          onClick={() =>
                            chat.openChat({ workspaceSlug, personId: entry.id })
                          }
                        >
                          <MessageCircleMore size={15} />
                          Chat
                        </button>
                      ) : null}
                      <a href={personEmailHref(entry.email)}>
                        <Mail size={15} />
                        Email
                      </a>
                    </div>
                  </article>
                ))}
              </div>
              {!directory.isLoading && visibleMembers.length === 0 ? (
                <p>No people match your search.</p>
              ) : null}
            </WorkspacePageSections>
          </>
        )}
      </Content>
    </Frame>
  );
}

function EmbeddedPeopleFrame({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
