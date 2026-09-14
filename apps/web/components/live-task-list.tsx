"use client";
import { PersonIdentity } from "./person-identity";

import type { WorkItemDto, WorkspaceDto } from "@founderhq/api-contract";
import {
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
} from "react";
import {
  CalendarDays,
  ArrowUpRight,
  ChevronDown,
  Columns3,
  LayoutGrid,
  List,
  Pencil,
  Search,
} from "lucide-react";
import { AppLink as Link } from "@/components/navigation-link";
import { editableStatusOptions, recordKey } from "@/lib/live-work-view-helpers";
import {
  formatLiveDateOnly,
  workItemStatusLabel,
} from "@/lib/live-workflow-ui";
import {
  taskMatchesPeriod,
  taskPeriodLabels,
  taskPeriods,
  taskStatuses,
  taskToday,
  sortTasks,
  type TaskPeriod,
} from "@/lib/task-views";
import { taskHref, workspaceHref } from "@/lib/workspace-routes";
import { WindowedCollection } from "./windowed-collection";
import styles from "./live-task-list.module.css";

function TaskSelect(props: ComponentProps<"select">) {
  return (
    <span className={styles.selectShell}>
      <select {...props} />
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  );
}

/** Readable task summaries, with deliberate entry points into editing. */
export function LiveTaskList({
  items,
  workspaces,
  userId,
  timezone,
  pendingIds,
  onStatusChange,
  onOpen,
  initialPeriod = "all",
  label = "Work records",
  complete = true,
}: {
  items: WorkItemDto[];
  workspaces: WorkspaceDto[];
  userId: string;
  timezone: string;
  pendingIds: ReadonlySet<string>;
  onStatusChange: (item: WorkItemDto, status: WorkItemDto["status"]) => void;
  onOpen?: (item: WorkItemDto) => void;
  initialPeriod?: TaskPeriod;
  label?: string;
  complete?: boolean;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState<TaskPeriod>(initialPeriod);
  const [status, setStatus] = useState("all");
  const [assignee, setAssignee] = useState("all");
  const [workspaceId, setWorkspaceId] = useState("all");
  const [priority, setPriority] = useState("all");
  const [topic, setTopic] = useState("");
  const [kind, setKind] = useState("");
  const topics = [
    ...new Set(
      items.flatMap((item) =>
        item.planning?.topic ? [item.planning.topic] : [],
      ),
    ),
  ].sort();
  const kinds = [
    ...new Set(
      items.flatMap((item) =>
        item.planning?.workKind ? [item.planning.workKind] : [],
      ),
    ),
  ].sort();
  const [view, setView] = useState<"cards" | "list" | "board">("cards");
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [cardPage, setCardPage] = useState({ index: 0, filters: "" });
  const [sort, setSort] = useState<"due" | "priority" | "recent">("due");
  const [today, setToday] = useState(() => taskToday(timezone));
  useEffect(() => {
    const update = () => setToday(taskToday(timezone));
    update();
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", update);
    };
  }, [timezone]);
  const people = useMemo(
    () =>
      [
        ...new Map(
          items
            .flatMap((item) => item.assignees)
            .map((person) => [person.id, person]),
        ).values(),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    [items],
  );
  const workspaceNames = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace])),
    [workspaces],
  );
  const availableWorkspaceId = workspaceNames.has(workspaceId)
    ? workspaceId
    : "all";
  const scoped = useMemo(
    () =>
      items.filter((item) => {
        const query = search.trim().toLocaleLowerCase();
        return (
          (!query ||
            `${item.title} ${item.description} ${item.planning?.topic ?? ""} ${item.planning?.workKind ?? ""} ${Object.values(item.planning?.details ?? {}).join(" ")} ${workspaceNames.get(item.workspaceId)?.name ?? ""} ${item.assignees.map((person) => person.name).join(" ")}`
              .toLocaleLowerCase()
              .includes(query)) &&
          (availableWorkspaceId === "all" ||
            item.workspaceId === availableWorkspaceId) &&
          (assignee === "all" ||
            (assignee === "unassigned"
              ? item.assignees.length === 0
              : item.assignees.some(
                  (person) =>
                    person.id === (assignee === "me" ? userId : assignee),
                ))) &&
          (priority === "all" || item.priority === priority) &&
          (status === "all" || item.status === status) &&
          (!topic || item.planning?.topic === topic) &&
          (!kind || item.planning?.workKind === kind)
        );
      }),
    [
      items,
      search,
      availableWorkspaceId,
      assignee,
      priority,
      topic,
      kind,
      status,
      workspaceNames,
      userId,
    ],
  );
  const visible = useMemo(
    () =>
      sortTasks(
        scoped.filter((item) => taskMatchesPeriod(item, period, today)),
        sort,
      ),
    [scoped, period, today, sort],
  );
  const done = items.filter((item) => item.status === "done").length;
  const cardPageSize = 24;
  const lastCardPage = Math.max(
    0,
    Math.ceil(visible.length / cardPageSize) - 1,
  );
  const cardFilterKey = JSON.stringify([
    search,
    period,
    status,
    assignee,
    availableWorkspaceId,
    priority,
    topic,
    kind,
    sort,
  ]);
  const activeCardPage =
    cardPage.filters === cardFilterKey
      ? Math.min(cardPage.index, lastCardPage)
      : 0;
  const cardItems = visible.slice(
    activeCardPage * cardPageSize,
    (activeCardPage + 1) * cardPageSize,
  );

  function renderItem(item: WorkItemDto) {
    const workspace = workspaceNames.get(item.workspaceId);
    const href =
      item.type === "task"
        ? taskHref(workspace?.slug ?? "", item.id)
        : `${workspaceHref(workspace?.slug ?? "")}/boards/${encodeURIComponent(item.boardId)}#${encodeURIComponent(item.id)}`;
    const statusLabel = {
      not_started: "Not started",
      working: "In progress",
      review: "In review",
      blocked: "Blocked",
      done: "Completed",
    }[item.status];
    const overdue =
      item.status !== "done" && Boolean(item.dueDate && item.dueDate < today);
    const title = (
      <>
        <strong>{item.title}</strong>
        <small>
          {item.planning?.workKind ?? item.type}
          {item.planning?.topic ? ` · ${item.planning.topic}` : ""}
          {workspace ? ` · ${workspace.name}` : ""}
        </small>
      </>
    );
    return (
      <article
        className={`${styles.task} ${view !== "list" ? styles.card : ""}`}
        data-status={item.status}
        data-version={item.version}
        data-testid={`work-item-${item.id}`}
        role="listitem"
      >
        {onOpen && item.type !== "task" ? (
          <button
            className={styles.title}
            title={item.title}
            onClick={() => onOpen(item)}
            type="button"
          >
            {title}
          </button>
        ) : (
          <Link className={styles.title} title={item.title} href={href}>
            {title}
          </Link>
        )}
        {view !== "list" ? (
          <p className={styles.description} title={item.description}>
            {item.description}
          </p>
        ) : null}
        <span
          className={styles.assignees}
          title={
            item.assignees.map((person) => person.name).join(", ") ||
            "Unassigned"
          }
        >
          {view !== "list" ? (
            <span className={styles.fieldLabel}>Owner</span>
          ) : null}
          {item.assignees.length
            ? item.assignees.map((person, index) => (
                <span key={person.id}>
                  {index ? ", " : ""}
                  {workspace?.slug ? (
                    <PersonIdentity
                      workspaceSlug={workspace.slug}
                      userId={person.id}
                      name={person.name}
                    />
                  ) : (
                    person.name
                  )}
                </span>
              ))
            : "Unassigned"}
        </span>
        {view === "list" && editingStatusId === item.id ? (
          <span className={styles.statusEditor}>
            <TaskSelect
              aria-label={`Status for ${item.title}`}
              disabled={
                pendingIds.has(item.id) ||
                item.status === "blocked" ||
                item.status === "done"
              }
              value={item.status}
              onChange={(event) =>
                onStatusChange(
                  item,
                  event.target.value as WorkItemDto["status"],
                )
              }
            >
              {editableStatusOptions(item.status).map((candidate) => (
                <option key={candidate} value={candidate}>
                  {workItemStatusLabel(candidate)}
                </option>
              ))}
            </TaskSelect>
            <button type="button" onClick={() => setEditingStatusId(null)}>
              Done editing
            </button>
          </span>
        ) : (
          <span className={styles.statusField}>
            <span className={styles.statusBadge} data-status={item.status}>
              <span aria-hidden="true" />
              {statusLabel}
            </span>
            {view === "list" ? (
              <button
                type="button"
                className={styles.editStatus}
                aria-label={`Edit status for ${item.title}`}
                onClick={() => setEditingStatusId(item.id)}
              >
                <Pencil size={13} aria-hidden="true" />
              </button>
            ) : null}
          </span>
        )}
        <span
          className={styles.priority}
          data-priority={item.priority}
          aria-label={`Priority: ${item.priority}`}
        >
          {item.priority}
        </span>
        <span className={styles.due} data-overdue={overdue}>
          <CalendarDays size={13} aria-hidden="true" />
          {view !== "list" ? (
            <span className={styles.fieldLabel}>Due</span>
          ) : null}
          {item.dueDate
            ? `${overdue ? "Overdue · " : ""}${formatLiveDateOnly(item.dueDate, timezone)}`
            : "No due date"}
        </span>
        <span
          className={pendingIds.has(item.id) ? styles.saved : "sr-only"}
          aria-live="polite"
        >
          {pendingIds.has(item.id)
            ? "Saving…"
            : `Saved version ${item.version}`}
        </span>
        {view !== "list" ? (
          <div className={styles.cardActions}>
            <span className={styles.openHint} aria-hidden="true">
              Open {item.type}
              <ArrowUpRight size={14} />
            </span>
            {onOpen && item.type !== "task" ? (
              <button
                className={styles.editTask}
                type="button"
                aria-label={`Edit ${item.type}`}
                title={`Edit ${item.title}`}
                onClick={() => onOpen(item)}
              >
                <Pencil size={13} aria-hidden="true" />
                Edit
              </button>
            ) : (
              <Link
                className={styles.editTask}
                aria-label={`Edit ${item.type}`}
                title={`Edit ${item.title}`}
                href={item.type === "task" ? `${href}#edit` : href}
              >
                <Pencil size={13} aria-hidden="true" />
                Edit
              </Link>
            )}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <div className={styles.collection}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search tasks</span>
          <input
            type="search"
            placeholder="Search tasks, people, or workspace…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <div className={styles.views} role="group" aria-label="Task view">
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => setView("cards")}
          >
            <LayoutGrid size={15} aria-hidden="true" /> Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={15} /> List
          </button>
          <button
            type="button"
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            <Columns3 size={15} /> Board
          </button>
        </div>
      </div>
      <div
        className={styles.periods}
        role="group"
        aria-label="Task dates and completion"
      >
        {taskPeriods.map((candidate) => (
          <button
            type="button"
            key={candidate}
            aria-pressed={period === candidate}
            onClick={() => setPeriod(candidate)}
          >
            {taskPeriodLabels[candidate]}{" "}
            <span>
              {
                scoped.filter((item) =>
                  taskMatchesPeriod(item, candidate, today),
                ).length
              }
              {complete ? "" : "+"}
            </span>
          </button>
        ))}
      </div>
      <div className={styles.filters}>
        {topics.length > 0 ? (
          <label>
            Topic
            <TaskSelect
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            >
              <option value="">All topics</option>
              {topics.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </TaskSelect>
          </label>
        ) : null}
        {kinds.length > 0 ? (
          <label>
            Work category
            <TaskSelect
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="">All categories</option>
              {kinds.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </TaskSelect>
          </label>
        ) : null}
        <label>
          Status
          <TaskSelect
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {taskStatuses.map((candidate) => (
              <option key={candidate} value={candidate}>
                {workItemStatusLabel(candidate)}
              </option>
            ))}
          </TaskSelect>
        </label>
        <label>
          Assignee
          <TaskSelect
            value={assignee}
            onChange={(event) => setAssignee(event.target.value)}
          >
            <option value="all">Everyone</option>
            <option value="me">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </TaskSelect>
        </label>
        {workspaces.length > 1 ? (
          <label>
            Workspace
            <TaskSelect
              value={availableWorkspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
            >
              <option value="all">All workspaces</option>
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </TaskSelect>
          </label>
        ) : null}
        <label>
          Priority
          <TaskSelect
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            <option value="all">All priorities</option>
            {["urgent", "high", "normal", "low", "none"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </TaskSelect>
        </label>
        <label>
          Sort by
          <TaskSelect
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
          >
            <option value="due">Due date</option>
            <option value="priority">Priority</option>
            <option value="recent">Recently updated</option>
          </TaskSelect>
        </label>
      </div>
      <div className={styles.progress}>
        <span>
          {visible.length} shown · {done} of {items.length} completed
          {complete ? "" : " · Loading more work…"}
        </span>
        <progress
          aria-label="Task completion"
          max={Math.max(items.length, 1)}
          value={done}
        />
      </div>
      {visible.length === 0 ? (
        <div className={styles.empty}>
          <strong>
            {items.length ? "No tasks match these filters" : "No tasks yet"}
          </strong>
          <p>
            {items.length
              ? "Try another date, person, or status."
              : "Create a task, choose who owns it, and set a due date."}
          </p>
          {items.length ? (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setPeriod("all");
                setAssignee("all");
                setStatus("all");
                setPriority("all");
                setWorkspaceId("all");
                setTopic("");
                setKind("");
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      ) : view === "cards" ? (
        <>
          <WindowedCollection
            items={cardItems}
            itemKey={recordKey}
            label={label}
            className={styles.cardGrid}
          >
            {renderItem}
          </WindowedCollection>
          {visible.length > cardPageSize ? (
            <nav className={styles.pagination} aria-label="Task card pages">
              <span>
                {activeCardPage * cardPageSize + 1}–
                {Math.min((activeCardPage + 1) * cardPageSize, visible.length)}{" "}
                of {visible.length} tasks · Page {activeCardPage + 1} of{" "}
                {lastCardPage + 1}
              </span>
              <button
                type="button"
                disabled={activeCardPage === 0}
                onClick={() =>
                  setCardPage({
                    index: activeCardPage - 1,
                    filters: cardFilterKey,
                  })
                }
              >
                Previous tasks
              </button>
              <button
                type="button"
                disabled={activeCardPage === lastCardPage}
                onClick={() =>
                  setCardPage({
                    index: activeCardPage + 1,
                    filters: cardFilterKey,
                  })
                }
              >
                Next tasks
              </button>
            </nav>
          ) : null}
        </>
      ) : view === "list" ? (
        <WindowedCollection
          items={visible}
          itemKey={recordKey}
          label={label}
          className={styles.rows}
        >
          {renderItem}
        </WindowedCollection>
      ) : (
        <div className={styles.board} role="group" aria-label={label}>
          {taskStatuses.map((candidate) => {
            const column = visible.filter((item) => item.status === candidate);
            return (
              <section
                className={styles.column}
                data-status={candidate}
                key={candidate}
                aria-labelledby={`${id}-${candidate}`}
              >
                <h3 id={`${id}-${candidate}`}>
                  {workItemStatusLabel(candidate)} <span>{column.length}</span>
                </h3>
                <WindowedCollection
                  items={column}
                  itemKey={recordKey}
                  label={`${workItemStatusLabel(candidate)} tasks`}
                  className={styles.cards}
                  estimateHeight={300}
                >
                  {renderItem}
                </WindowedCollection>
                {!column.length ? (
                  <p className={styles.columnEmpty}>No tasks</p>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
