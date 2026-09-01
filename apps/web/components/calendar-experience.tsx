"use client";

import { createApiClient } from "@founderhq/api-client";
import { demoItems, demoWorkspaces } from "@founderhq/core";
import type {
  BoardDto,
  CalendarEventDto,
  WorkspaceCalendarDto,
} from "@founderhq/api-contract";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  ListTodo,
  MapPin,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useAppSession } from "@/lib/app-session-context";
import { useOptionalLiveAppData } from "@/lib/live-app-data";
import { useWorkspace } from "@/lib/workspace-context";
import { LiveStateNotice } from "./live-state";
import { WorkspaceFrame } from "./workspace-frame";
import styles from "./calendar-experience.module.css";

type CalendarView = "month" | "week" | "day";
type ComposerKind = "event" | "task";

interface TaskCalendarEntry {
  id: string;
  title: string;
  date: string;
  status: string;
  priority: string;
}

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function CalendarExperience({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const session = useAppSession();
  const liveData = useOptionalLiveAppData();
  const workspaceContext = useWorkspace();
  const client = useMemo(
    () => liveData?.client ?? createApiClient({ baseUrl: "/api/v1" }),
    [liveData?.client],
  );
  const workspace =
    workspaceContext.allWorkspaces.find(
      (candidate) => candidate.slug === workspaceSlug,
    ) ?? demoWorkspaces.find((candidate) => candidate.slug === workspaceSlug);
  const [view, setView] = useState<CalendarView>("month");
  const [anchor, setAnchor] = useState(() => startOfLocalDay(new Date()));
  const [snapshot, setSnapshot] = useState<WorkspaceCalendarDto | null>(null);
  const [boards, setBoards] = useState<BoardDto[]>([]);
  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    new Set(),
  );
  const [showTasks, setShowTasks] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [createdTasks, setCreatedTasks] = useState<TaskCalendarEntry[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDto | null>(
    null,
  );

  const range = useMemo(() => calendarRange(anchor, view), [anchor, view]);
  const timezone = session.organization.timezone ?? "Europe/Berlin";

  useEffect(() => {
    if (!workspace) return;
    let active = true;
    Promise.all([
      client.workspaceCalendar(workspace.id, {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      }),
      client.boards(workspace.id),
    ])
      .then(([nextSnapshot, nextBoards]) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        setBoards(nextBoards);
        setSelectedSources((current) => {
          const available = new Set(
            nextSnapshot.calendars
              .filter((calendar) => calendar.visibleByDefault)
              .map((calendar) => calendar.id),
          );
          if (current.size === 0) return available;
          return new Set(
            [...current].filter((source) =>
              nextSnapshot.calendars.some((calendar) => calendar.id === source),
            ),
          );
        });
        setError("");
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "The calendar could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, range.from, range.to, refreshKey, workspace]);

  const taskEntries = useMemo<TaskCalendarEntry[]>(
    () =>
      [
        ...(workspaceContext.dataMode === "live"
          ? workspaceContext.allItems
          : demoItems
        )
          .filter(
            (item) =>
              item.workspaceId === workspace?.id && Boolean(item.dueDate),
          )
          .map((item) => ({
            id: item.id,
            title: item.title,
            date: item.dueDate!,
            status: item.status,
            priority: item.priority,
          })),
        ...createdTasks,
      ].filter(
        (entry, index, entries) =>
          entries.findIndex((candidate) => candidate.id === entry.id) === index,
      ),
    [
      createdTasks,
      workspace?.id,
      workspaceContext.allItems,
      workspaceContext.dataMode,
    ],
  );
  const visibleEvents = (snapshot?.events ?? []).filter(
    (event) =>
      selectedSources.has(event.calendarId) && event.status !== "cancelled",
  );
  const days = calendarDays(anchor, view);
  const allSelected = Boolean(
    snapshot?.calendars.length &&
    snapshot.calendars.every((calendar) => selectedSources.has(calendar.id)),
  );

  const navigate = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === "month") next.setMonth(next.getMonth() + direction);
    else next.setDate(next.getDate() + direction * (view === "week" ? 7 : 1));
    setAnchor(startOfLocalDay(next));
  };

  if (!workspace) {
    return (
      <WorkspaceFrame active="calendar" workspaceSlug={workspaceSlug}>
        <main className={styles.missing}>This workspace is unavailable.</main>
      </WorkspaceFrame>
    );
  }

  return (
    <WorkspaceFrame active="calendar" workspaceSlug={workspaceSlug}>
      <main className={styles.page}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>Workspace · {workspace.name}</span>
            <h1>Calendar</h1>
            <p>One schedule for TREVV events, meetings, and due work.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => setConnectionOpen(true)}>
              <Settings2 size={16} /> Calendar connections
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => setComposerOpen(true)}
            >
              <Plus size={17} /> Create
            </button>
          </div>
        </header>

        {error ? (
          <div className={styles.notice}>
            <LiveStateNotice
              kind="failed"
              title="Calendar could not be loaded"
              description={error}
              actions={
                <button
                  type="button"
                  onClick={() => setRefreshKey((key) => key + 1)}
                >
                  <RefreshCw size={15} /> Try again
                </button>
              }
            />
          </div>
        ) : null}

        <section className={styles.toolbar} aria-label="Calendar controls">
          <div className={styles.navigation}>
            <button
              type="button"
              onClick={() => setAnchor(startOfLocalDay(new Date()))}
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Previous period"
              onClick={() => navigate(-1)}
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              aria-label="Next period"
              onClick={() => navigate(1)}
            >
              <ChevronRight size={18} />
            </button>
            <h2>{rangeLabel(anchor, view)}</h2>
          </div>
          <div className={styles.viewPicker} aria-label="Calendar view">
            {(["day", "week", "month"] as const).map((candidate) => (
              <button
                type="button"
                key={candidate}
                className={view === candidate ? styles.active : ""}
                aria-pressed={view === candidate}
                onClick={() => setView(candidate)}
              >
                {capitalize(candidate)}
              </button>
            ))}
          </div>
        </section>

        <div className={styles.layout}>
          <aside className={styles.sources} aria-label="Calendar sources">
            <section>
              <div className={styles.sourceHeading}>
                <h2>My calendars</h2>
                <button
                  type="button"
                  aria-label="Manage calendar connections"
                  onClick={() => setConnectionOpen(true)}
                >
                  <Settings2 size={15} />
                </button>
              </div>
              <SourceToggle
                checked={allSelected}
                color="#24243a"
                label="Combined view"
                detail={`${snapshot?.calendars.length ?? 0} calendars`}
                onChange={() =>
                  setSelectedSources(
                    allSelected
                      ? new Set()
                      : new Set(
                          snapshot?.calendars.map((calendar) => calendar.id),
                        ),
                  )
                }
              />
              {(snapshot?.calendars ?? []).map((calendar) => (
                <SourceToggle
                  key={calendar.id}
                  checked={selectedSources.has(calendar.id)}
                  color={calendar.color}
                  label={calendar.name}
                  detail={
                    calendar.isPrimary
                      ? "Primary · TREVV"
                      : providerLabel(calendar.provider)
                  }
                  onChange={() =>
                    setSelectedSources((current) =>
                      toggleSet(current, calendar.id),
                    )
                  }
                />
              ))}
              <SourceToggle
                checked={showTasks}
                color="#d48535"
                label="Tasks and deadlines"
                detail={`${taskEntries.length} scheduled`}
                onChange={() => setShowTasks((current) => !current)}
              />
            </section>

            <section className={styles.providerSummary}>
              <h2>Connected calendars</h2>
              {(snapshot?.providerAvailability ?? []).map((provider) => (
                <button
                  type="button"
                  key={provider.provider}
                  onClick={() => setConnectionOpen(true)}
                >
                  <span
                    className={
                      provider.provider === "google_calendar"
                        ? styles.google
                        : styles.microsoft
                    }
                  >
                    {provider.provider === "google_calendar" ? "G" : "M"}
                  </span>
                  <span>
                    <strong>{provider.label}</strong>
                    <small>
                      {provider.state === "connected"
                        ? "Connected"
                        : "Not connected"}
                    </small>
                  </span>
                  <Plus size={15} />
                </button>
              ))}
            </section>
          </aside>

          <section className={styles.calendar} aria-busy={loading}>
            {view === "month" ? (
              <MonthGrid
                days={days}
                anchor={anchor}
                events={visibleEvents}
                tasks={showTasks ? taskEntries : []}
                onCreate={(day) => {
                  setAnchor(day);
                  setComposerOpen(true);
                }}
                onEvent={setSelectedEvent}
              />
            ) : (
              <AgendaGrid
                days={days}
                events={visibleEvents}
                tasks={showTasks ? taskEntries : []}
                onCreate={(day) => {
                  setAnchor(day);
                  setComposerOpen(true);
                }}
                onEvent={setSelectedEvent}
              />
            )}
            {loading && !snapshot ? (
              <div className={styles.loading}>Loading your schedule…</div>
            ) : null}
          </section>
        </div>
      </main>

      {composerOpen ? (
        <CalendarComposer
          workspaceId={workspace.id}
          {...(snapshot?.calendars.find((calendar) => calendar.isPrimary)?.id
            ? {
                calendarId: snapshot.calendars.find(
                  (calendar) => calendar.isPrimary,
                )!.id,
              }
            : {})}
          boards={boards}
          initialDate={dateKey(anchor)}
          timezone={timezone}
          onClose={() => setComposerOpen(false)}
          onCreateEvent={async (input) => {
            const result = await client.createCalendarEvent(
              workspace.id,
              input,
              crypto.randomUUID(),
            );
            setSnapshot((current) =>
              current
                ? { ...current, events: [...current.events, result.data] }
                : current,
            );
          }}
          onCreateTask={async (input) => {
            const result = await client.createItem(input, crypto.randomUUID());
            if (result.data.dueDate)
              setCreatedTasks((current) => [
                ...current,
                {
                  id: result.data.id,
                  title: result.data.title,
                  date: result.data.dueDate!,
                  status: result.data.status,
                  priority: result.data.priority,
                },
              ]);
            await liveData?.refresh();
          }}
        />
      ) : null}

      {connectionOpen ? (
        <ConnectionCenter
          providers={snapshot?.providerAvailability ?? []}
          onClose={() => setConnectionOpen(false)}
        />
      ) : null}

      {selectedEvent ? (
        <EventDetails
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      ) : null}
    </WorkspaceFrame>
  );
}

function MonthGrid({
  days,
  anchor,
  events,
  tasks,
  onCreate,
  onEvent,
}: {
  days: Date[];
  anchor: Date;
  events: CalendarEventDto[];
  tasks: TaskCalendarEntry[];
  onCreate(day: Date): void;
  onEvent(event: CalendarEventDto): void;
}) {
  return (
    <div className={styles.monthGrid}>
      {weekdayLabels.map((label) => (
        <div className={styles.weekday} key={label}>
          {label}
        </div>
      ))}
      {days.map((day) => {
        const key = dateKey(day);
        const dayEvents = events.filter(
          (event) => localDateKey(event.startAt) === key,
        );
        const dayTasks = tasks.filter((task) => task.date === key);
        return (
          <article
            className={`${styles.dayCell} ${day.getMonth() !== anchor.getMonth() ? styles.outside : ""} ${key === dateKey(new Date()) ? styles.today : ""}`}
            key={key}
          >
            <button
              type="button"
              className={styles.dayNumber}
              onClick={() => onCreate(day)}
              aria-label={`Create on ${day.toLocaleDateString()}`}
            >
              {day.getDate()}
            </button>
            <div className={styles.dayEntries}>
              {dayEvents.slice(0, 3).map((event) => (
                <button
                  type="button"
                  className={styles.eventChip}
                  key={event.id}
                  onClick={() => onEvent(event)}
                >
                  <span>
                    {event.allDay ? "All day" : formatTime(event.startAt)}
                  </span>{" "}
                  {event.title}
                </button>
              ))}
              {dayTasks
                .slice(0, Math.max(0, 3 - dayEvents.length))
                .map((task) => (
                  <span className={styles.taskChip} key={task.id}>
                    <ListTodo size={11} /> {task.title}
                  </span>
                ))}
              {dayEvents.length + dayTasks.length > 3 ? (
                <small>+{dayEvents.length + dayTasks.length - 3} more</small>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function AgendaGrid({
  days,
  events,
  tasks,
  onCreate,
  onEvent,
}: {
  days: Date[];
  events: CalendarEventDto[];
  tasks: TaskCalendarEntry[];
  onCreate(day: Date): void;
  onEvent(event: CalendarEventDto): void;
}) {
  return (
    <div
      className={styles.agendaGrid}
      style={{
        gridTemplateColumns: `repeat(${days.length}, minmax(180px, 1fr))`,
      }}
    >
      {days.map((day) => {
        const key = dateKey(day);
        const dayEvents = events.filter(
          (event) => localDateKey(event.startAt) === key,
        );
        const dayTasks = tasks.filter((task) => task.date === key);
        return (
          <article
            key={key}
            className={key === dateKey(new Date()) ? styles.todayColumn : ""}
          >
            <header>
              <span>{weekdayLabels[(day.getDay() + 6) % 7]}</span>
              <strong>{day.getDate()}</strong>
            </header>
            <button
              type="button"
              className={styles.addSlot}
              onClick={() => onCreate(day)}
            >
              <Plus size={14} /> Add
            </button>
            {[...dayEvents]
              .sort((a, b) => a.startAt.localeCompare(b.startAt))
              .map((event) => (
                <button
                  type="button"
                  className={styles.agendaEvent}
                  key={event.id}
                  onClick={() => onEvent(event)}
                >
                  <small>
                    {event.allDay
                      ? "All day"
                      : `${formatTime(event.startAt)}–${formatTime(event.endAt)}`}
                  </small>
                  <strong>{event.title}</strong>
                  {event.location ? (
                    <span>
                      <MapPin size={11} /> {event.location}
                    </span>
                  ) : null}
                </button>
              ))}
            {dayTasks.map((task) => (
              <div className={styles.agendaTask} key={task.id}>
                <ListTodo size={14} />
                <span>
                  <small>Due task · {capitalize(task.priority)}</small>
                  <strong>{task.title}</strong>
                </span>
              </div>
            ))}
            {!dayEvents.length && !dayTasks.length ? (
              <p className={styles.emptyDay}>Open day</p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function SourceToggle({
  checked,
  color,
  label,
  detail,
  onChange,
}: {
  checked: boolean;
  color: string;
  label: string;
  detail: string;
  onChange(): void;
}) {
  return (
    <button
      type="button"
      className={styles.sourceToggle}
      aria-pressed={checked}
      onClick={onChange}
    >
      <span
        className={styles.checkbox}
        style={{
          background: checked ? color : "transparent",
          borderColor: color,
        }}
      >
        {checked ? <Check size={12} /> : null}
      </span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
    </button>
  );
}

function CalendarComposer({
  workspaceId,
  calendarId,
  boards,
  initialDate,
  timezone,
  onClose,
  onCreateEvent,
  onCreateTask,
}: {
  workspaceId: string;
  calendarId?: string;
  boards: BoardDto[];
  initialDate: string;
  timezone: string;
  onClose(): void;
  onCreateEvent(
    input: Parameters<
      ReturnType<typeof createApiClient>["createCalendarEvent"]
    >[1],
  ): Promise<void>;
  onCreateTask(
    input: Parameters<ReturnType<typeof createApiClient>["createItem"]>[0],
  ): Promise<void>;
}) {
  const [kind, setKind] = useState<ComposerKind>("event");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const [priority, setPriority] = useState<
    "urgent" | "high" | "normal" | "low" | "none"
  >("normal");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selectedBoardId = boardId || boards[0]?.id || "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    setError("");
    try {
      if (kind === "event") {
        if (!calendarId)
          throw new Error("The primary TREVV calendar is unavailable.");
        const startAt = localInputToIso(date, allDay ? "00:00" : startTime);
        const endAt = localInputToIso(
          date,
          allDay ? "00:00" : endTime,
          allDay ? 1 : 0,
        );
        await onCreateEvent({
          calendarId,
          kind: meetingUrl ? "meeting" : "event",
          title: title.trim(),
          description: description.trim(),
          startAt,
          endAt,
          allDay,
          timezone,
          location: location.trim(),
          ...(meetingUrl.trim() ? { meetingUrl: meetingUrl.trim() } : {}),
          attendees: [],
        });
      } else {
        if (!selectedBoardId)
          throw new Error("Create a plan before scheduling a task.");
        await onCreateTask({
          workspaceId,
          boardId: selectedBoardId,
          title: title.trim(),
          description: description.trim(),
          type: "task",
          priority,
          status: "not_started",
          dueDate: date,
          assigneeIds: [],
        });
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nothing was saved.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-create-title"
      >
        <header>
          <div>
            <span>Create in TREVV</span>
            <h2 id="calendar-create-title">New {kind}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className={styles.kindPicker}>
          {(["event", "task"] as const).map((candidate) => (
            <button
              type="button"
              key={candidate}
              className={kind === candidate ? styles.active : ""}
              onClick={() => setKind(candidate)}
            >
              {candidate === "event" ? (
                <CalendarDays size={15} />
              ) : (
                <ListTodo size={15} />
              )}
              {capitalize(candidate)}
            </button>
          ))}
        </div>
        <form onSubmit={submit}>
          <label>
            Title
            <input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={300}
              placeholder={
                kind === "event" ? "Planning meeting" : "Prepare project brief"
              }
            />
          </label>
          <div className={styles.formRow}>
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
              />
            </label>
            {kind === "event" ? (
              <>
                <label>
                  Starts
                  <input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    disabled={allDay}
                    required
                  />
                </label>
                <label>
                  Ends
                  <input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    disabled={allDay}
                    required
                  />
                </label>
              </>
            ) : null}
          </div>
          {kind === "event" ? (
            <label className={styles.inlineCheck}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(event) => setAllDay(event.target.checked)}
              />{" "}
              All-day event
            </label>
          ) : null}
          {kind === "task" ? (
            <div className={styles.formRow}>
              <label>
                Plan
                <select
                  value={selectedBoardId}
                  onChange={(event) => setBoardId(event.target.value)}
                  required
                >
                  <option value="">Select a plan</option>
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Priority
                <select
                  value={priority}
                  onChange={(event) =>
                    setPriority(event.target.value as typeof priority)
                  }
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>
          ) : null}
          {kind === "event" ? (
            <div className={styles.formRow}>
              <label>
                Location
                <input
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                  placeholder="Office or room"
                />
              </label>
              <label>
                Meeting link
                <input
                  type="url"
                  value={meetingUrl}
                  onChange={(event) => setMeetingUrl(event.target.value)}
                  placeholder="https://…"
                />
              </label>
            </div>
          ) : null}
          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Add context or an agenda"
            />
          </label>
          {error ? (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          ) : null}
          <footer>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-button" disabled={pending}>
              {pending ? "Saving…" : `Create ${kind}`}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function ConnectionCenter({
  providers,
  onClose,
}: {
  providers: WorkspaceCalendarDto["providerAvailability"];
  onClose(): void;
}) {
  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={`${styles.dialog} ${styles.connectionDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connections-title"
      >
        <header>
          <div>
            <span>Workspace calendar</span>
            <h2 id="connections-title">Calendar connections</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <p className={styles.connectionIntro}>
          TREVV is your primary calendar. Connected providers will be merged
          into the combined view while remaining individually selectable.
        </p>
        <div className={styles.nativeCard}>
          <span>
            <CalendarDays size={21} />
          </span>
          <div>
            <strong>TREVV Calendar</strong>
            <p>
              Active, server-saved, and ready for events, meetings, tasks, and
              deadlines.
            </p>
          </div>
          <em>
            <Check size={13} /> Primary
          </em>
        </div>
        <div className={styles.providerCards}>
          {providers.map((provider) => (
            <article key={provider.provider}>
              <span
                className={
                  provider.provider === "google_calendar"
                    ? styles.google
                    : styles.microsoft
                }
              >
                {provider.provider === "google_calendar" ? "G" : "M"}
              </span>
              <div>
                <h3>{provider.label}</h3>
                <p>{provider.message}</p>
                <small>
                  <ShieldCheck size={13} /> Least-privilege access · revocable
                  connection · recoverable sync
                </small>
              </div>
              <button type="button" disabled>
                {provider.state === "connected" ? "Connected" : "Connect"}
              </button>
            </article>
          ))}
        </div>
        <div className={styles.securityNote}>
          <ShieldCheck size={18} />
          <div>
            <strong>Secure by default</strong>
            <p>
              Provider buttons activate only after OAuth credentials, approved
              scopes, encrypted token storage, webhook protection, revocation,
              and sync recovery are configured.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function EventDetails({
  event,
  onClose,
}: {
  event: CalendarEventDto;
  onClose(): void;
}) {
  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={`${styles.dialog} ${styles.detailsDialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-title"
      >
        <header>
          <div>
            <span>{providerLabel(event.source)}</span>
            <h2 id="event-title">{event.title}</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className={styles.eventMeta}>
          <p>
            <Clock3 size={16} /> {formatDateTimeRange(event)}
          </p>
          {event.location ? (
            <p>
              <MapPin size={16} /> {event.location}
            </p>
          ) : null}
          {event.meetingUrl ? (
            <a href={event.meetingUrl} target="_blank" rel="noreferrer">
              <Video size={16} /> Join meeting <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
        {event.description ? (
          <p className={styles.eventDescription}>{event.description}</p>
        ) : null}
        <footer>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}

function calendarRange(anchor: Date, view: CalendarView) {
  if (view === "month") {
    const from = startOfWeek(
      new Date(anchor.getFullYear(), anchor.getMonth(), 1),
    );
    const to = addDays(from, 42);
    return { from, to };
  }
  const from = view === "week" ? startOfWeek(anchor) : startOfLocalDay(anchor);
  return { from, to: addDays(from, view === "week" ? 7 : 1) };
}

function calendarDays(anchor: Date, view: CalendarView) {
  const { from, to } = calendarRange(anchor, view);
  const days: Date[] = [];
  for (let day = new Date(from); day < to; day = addDays(day, 1))
    days.push(day);
  return days;
}

function startOfWeek(value: Date) {
  const day = startOfLocalDay(value);
  day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return day;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}
function addDays(value: Date, amount: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + amount);
  return next;
}
function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function localDateKey(value: string) {
  return dateKey(new Date(value));
}
function localInputToIso(date: string, time: string, addDay = 0) {
  const value = new Date(`${date}T${time}:00`);
  if (addDay) value.setDate(value.getDate() + addDay);
  return value.toISOString();
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function rangeLabel(anchor: Date, view: CalendarView) {
  if (view === "month")
    return new Intl.DateTimeFormat(undefined, {
      month: "long",
      year: "numeric",
    }).format(anchor);
  const days = calendarDays(anchor, view);
  const first = days[0] ?? anchor;
  const last = days.at(-1) ?? anchor;
  if (view === "day")
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(first);
  return `${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(first)} – ${new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(last)}`;
}
function formatDateTimeRange(event: CalendarEventDto) {
  if (event.allDay)
    return `${new Date(event.startAt).toLocaleDateString()} · All day`;
  return `${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.startAt))} – ${formatTime(event.endAt)}`;
}
function providerLabel(provider: string) {
  if (provider === "google_calendar") return "Google Calendar";
  if (provider === "microsoft_outlook_calendar") return "Microsoft Outlook";
  return "TREVV Calendar";
}
function toggleSet(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}
function capitalize(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
