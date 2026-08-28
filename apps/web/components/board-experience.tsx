"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DistributionBar } from "./charts";
import { flexRender } from "@tanstack/react-table";
import {
  getCoreRowModel,
  useLegacyTable,
  type LegacyColumnDef,
  type LegacyRow,
} from "@tanstack/react-table/legacy";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Columns3,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  GripVertical,
  LayoutList,
  Link2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Plus,
  Rows3,
  Send,
  SlidersHorizontal,
  UserRound,
  Users,
  X,
} from "lucide-react";
import {
  boardForWorkspace,
  calculateWorkProgress,
  demoWorkItemGroups,
  groupsForBoard,
  workspaceBySlug,
  itemsForBoard,
  type Board,
  type Workspace,
  type WorkItem,
} from "@founderhq/core";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";
import { Hint } from "./learning-center";
import { useCustomWorkspaces } from "@/lib/custom-workspaces";
import { workspaceHref } from "@/lib/workspace-routes";

type Status = "planned" | "working" | "blocked" | "review" | "done";
type Priority = "Urgent" | "High" | "Normal" | "Low";
interface BoardItem {
  id: string;
  title: string;
  owner: string;
  initials: string;
  status: Status;
  priority: Priority;
  due: string;
  /** ISO date, kept so ranges can sort. `due` is display-only. */
  dueDate?: string | undefined;
  resources: number;
  updates: number;
  description: string;
  group: string;
  groupId: string;
}

const formatDueDate = (dueDate?: string) =>
  dueDate
    ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
        new Date(`${dueDate}T12:00:00Z`),
      )
    : "No date";

const initialsFor = (name?: string) =>
  name
    ? name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "—";

const descriptionFor = (item: WorkItem) => {
  const purpose: Record<WorkItem["type"], string> = {
    task: "Complete the defined work and attach the evidence needed for review.",
    decision:
      "Review the available evidence, record the chosen option, and unblock dependent work.",
    approval:
      "Review the submitted work, capture feedback, and record the approval outcome.",
    milestone:
      "Coordinate the required work and confirm that the milestone acceptance criteria are met.",
    idea: "Clarify the opportunity, expected impact, evidence, and next validation step.",
    request:
      "Triage the request, confirm ownership, and communicate the next action.",
  };
  return `${item.title}. ${purpose[item.type]}`;
};

const toBoardItem = (item: WorkItem): BoardItem => ({
  id: item.id,
  title: item.title,
  owner: item.assignee?.split(" ")[0] ?? "Unassigned",
  initials: initialsFor(item.assignee),
  status: item.status === "not_started" ? "planned" : item.status,
  priority:
    item.priority === "none"
      ? "Low"
      : (`${item.priority[0]?.toUpperCase()}${item.priority.slice(1)}` as Priority),
  due: formatDueDate(item.dueDate),
  ...(item.dueDate ? { dueDate: item.dueDate } : {}),
  resources: 0,
  updates: 0,
  description: descriptionFor(item),
  groupId: item.groupId ?? UNGROUPED_ID,
  group: groupNameFor(item.groupId),
});

const isBoardItem = (value: unknown): value is BoardItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BoardItem>;
  return Boolean(
    item.id &&
    item.title &&
    item.owner &&
    item.status &&
    item.priority &&
    item.groupId,
  );
};

/** Items without a Group still need a band, so they get a real one. */
const UNGROUPED_ID = "ungrouped";

const groupNameFor = (groupId?: string) =>
  demoWorkItemGroups.find((group) => group.id === groupId)?.name ?? "Ungrouped";

const statusLabel: Record<Status, string> = {
  planned: "Planned",
  working: "Working",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export function BoardExperience({
  workspaceSlug,
  boardId,
}: {
  workspaceSlug: string;
  boardId: string;
}) {
  const customRecord = useCustomWorkspaces().find(
    (record) => record.workspace.slug === workspaceSlug,
  );
  const workspace = workspaceBySlug(workspaceSlug) ?? customRecord?.workspace;
  const board = workspace
    ? (boardForWorkspace(workspace.id, boardId) ??
      (customRecord?.board.id === boardId ? customRecord.board : undefined))
    : undefined;
  if (!workspace || !board)
    return (
      <WorkspaceFrame active="workspace" workspaceSlug={workspaceSlug}>
        <main className="board-main board-not-found">
          <h1>Board not found</h1>
          <p>This board does not belong to the requested workspace.</p>
          <Link
            href={workspace ? workspaceHref(workspace.slug) : "/app/portfolio"}
          >
            Return to {workspace?.name ?? "Portfolio"}
          </Link>
        </main>
      </WorkspaceFrame>
    );
  return (
    <BoardWorkspace
      key={`${workspace.id}:${board.id}`}
      workspace={workspace}
      board={board}
      sourceItems={itemsForBoard(board.id)}
    />
  );
}

function BoardWorkspace({
  workspace,
  board,
  sourceItems,
}: {
  workspace: Workspace;
  board: Board;
  sourceItems: WorkItem[];
}) {
  const copy = productCopy.en.board;
  const boardGroups = useMemo(() => groupsForBoard(board.id), [board.id]);
  const groupRank = useMemo(() => {
    const order = new Map(boardGroups.map((group, index) => [group.id, index]));
    // Ungrouped items sort last rather than interleaving.
    return (groupId: string) => order.get(groupId) ?? boardGroups.length;
  }, [boardGroups]);
  // Rows must be contiguous per group for the bands to read correctly.
  const seedItems = useMemo(
    () =>
      sourceItems
        .map(toBoardItem)
        .sort(
          (left, right) => groupRank(left.groupId) - groupRank(right.groupId),
        ),
    [groupRank, sourceItems],
  );
  const [items, setItems] = useState(seedItems);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [selected, setSelected] = useState<BoardItem | null>(
    seedItems[0] ?? null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [showCounts, setShowCounts] = useState(true);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationEnabled, setAutomationEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [bulkMode, setBulkMode] = useState<"move" | "assign" | null>(null);
  const groupColor = (groupId: string) =>
    boardGroups.find((group) => group.id === groupId)?.color ??
    "var(--fh-border-strong)";
  const toggleGroup = (groupId: string) =>
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = `trevv:board:${board.id}`;
  useEffect(() => {
    let storedItems: BoardItem[] | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed) && parsed.every(isBoardItem))
          storedItems = parsed;
      }
    } catch {
      // Keep the server seed if client storage is unavailable or malformed.
    }
    const timer = window.setTimeout(() => {
      if (storedItems) setItems(storedItems);
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [seedItems, storageKey]);
  useEffect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Board editing remains available even when persistence is unavailable.
    }
  }, [items, storageKey, storageReady]);
  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return;
    const item = items.find((candidate) => candidate.id === hash);
    if (!item) return;
    const frame = window.requestAnimationFrame(() => setSelected(item));
    return () => window.cancelAnimationFrame(frame);
  }, [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 7 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const updateItem = (id: string, patch: Partial<BoardItem>) =>
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  const addItem = (status: Status = "planned", groupId?: string) => {
    const effectiveGroupId = groupId ?? boardGroups[0]?.id ?? UNGROUPED_ID;
    const item: BoardItem = {
      id: `board-item-${Date.now()}`,
      title: "Untitled work item",
      owner: workspace.lead.name.split(" ")[0] ?? workspace.lead.name,
      initials: workspace.lead.initials,
      status,
      priority: "Normal",
      due: "No date",
      resources: 0,
      updates: 0,
      description:
        "Describe the expected outcome, evidence, and completion criteria.",
      groupId: effectiveGroupId,
      group: groupNameFor(effectiveGroupId),
    };
    setItems((current) => [...current, item]);
    setSelected(item);
    setNotice("New work item created. Add the details in the open panel.");
  };
  const owners = Array.from(new Set(items.map((item) => item.owner))).sort();
  const visibleItems = items.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (ownerFilter !== "all" && item.owner !== ownerFilter) return false;
    const normalized = query.trim().toLocaleLowerCase();
    return !normalized || item.title.toLocaleLowerCase().includes(normalized);
  });
  const columns = useMemo<LegacyColumnDef<BoardItem>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <span className="select-cell">
            <input
              aria-label="Select all"
              type="checkbox"
              checked={
                visibleItems.length > 0 &&
                visibleItems.every((item) => checked.has(item.id))
              }
              onChange={(event) =>
                setChecked(
                  event.target.checked
                    ? new Set(visibleItems.map((item) => item.id))
                    : new Set(),
                )
              }
            />
          </span>
        ),
        cell: ({ row }) => (
          <input
            aria-label={`Select ${row.original.title}`}
            type="checkbox"
            checked={checked.has(row.original.id)}
            onChange={(event) =>
              setChecked((current) => {
                const next = new Set(current);
                if (event.target.checked) next.add(row.original.id);
                else next.delete(row.original.id);
                return next;
              })
            }
          />
        ),
        size: 84,
      },
      {
        accessorKey: "title",
        header: copy.item,
        cell: ({ row }) => (
          <button
            className="item-title-cell"
            onClick={() => setSelected(row.original)}
          >
            <span className={`type-dot ${row.original.status}`} />
            <span>{row.original.title}</span>
          </button>
        ),
        size: 330,
      },
      {
        accessorKey: "owner",
        header: copy.owner,
        cell: ({ row }) => (
          <button
            className="owner-cell"
            onClick={() => setSelected(row.original)}
          >
            <span
              className={`avatar avatar-${row.original.initials.toLowerCase()}`}
            >
              {row.original.initials}
            </span>
            <span>{row.original.owner}</span>
          </button>
        ),
        size: 145,
      },
      {
        accessorKey: "status",
        header: copy.status,
        cell: ({ row }) => (
          <select
            className={`status-select status-${row.original.status}`}
            aria-label={`Status for ${row.original.title}`}
            value={row.original.status}
            onChange={(event) =>
              updateItem(row.original.id, {
                status: event.target.value as Status,
              })
            }
          >
            {Object.entries(statusLabel).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        ),
        size: 125,
      },
      {
        accessorKey: "priority",
        header: copy.priority,
        cell: ({ row }) => (
          <select
            className={`priority-select priority-${row.original.priority.toLowerCase()}`}
            aria-label={`Priority for ${row.original.title}`}
            value={row.original.priority}
            onChange={(event) =>
              updateItem(row.original.id, {
                priority: event.target.value as Priority,
              })
            }
          >
            {["Urgent", "High", "Normal", "Low"].map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
        ),
        size: 105,
      },
      {
        accessorKey: "due",
        header: copy.due,
        cell: ({ row }) => (
          <button
            className={`date-cell ${row.original.due === "Aug 22" ? "overdue" : ""}`}
            onClick={() => setSelected(row.original)}
          >
            <CalendarDays size={13} />
            {row.original.due}
          </button>
        ),
        size: 105,
      },
      {
        accessorKey: "resources",
        header: copy.resources,
        cell: ({ row }) => (
          <button
            className="count-cell"
            onClick={() => setSelected(row.original)}
          >
            <Paperclip size={13} />
            {row.original.resources}
          </button>
        ),
        size: 92,
      },
      {
        accessorKey: "updates",
        header: copy.updates,
        cell: ({ row }) => (
          <button
            className="count-cell"
            onClick={() => setSelected(row.original)}
          >
            <MessageSquare size={13} />
            {row.original.updates}
          </button>
        ),
        size: 80,
      },
    ],
    [checked, copy, visibleItems],
  );
  const table = useLegacyTable({
    data: visibleItems,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
    state: {
      columnVisibility: {
        resources: showCounts,
        updates: showCounts,
      },
    },
  });
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id)
      setItems((current) => {
        const oldIndex = current.findIndex((item) => item.id === active.id);
        const newIndex = current.findIndex((item) => item.id === over.id);
        return arrayMove(current, oldIndex, newIndex);
      });
  };
  const progressItems = sourceItems.map((sourceItem) => {
    const item = items.find((candidate) => candidate.id === sourceItem.id);
    return {
      ...sourceItem,
      status:
        item?.status === "planned"
          ? ("not_started" as const)
          : (item?.status ?? sourceItem.status),
    };
  });
  const progress =
    calculateWorkProgress(
      progressItems,
      workspace.progressMode ?? "task_completion",
    ) ?? 0;
  const dependencyTitle =
    items.find((item) =>
      sourceItems.find(
        (source) => source.id === item.id && source.type === "milestone",
      ),
    )?.title ?? "No dependency";
  const applyBulkMove = (groupId: string) => {
    setItems((current) =>
      current.map((item) =>
        checked.has(item.id)
          ? { ...item, groupId, group: groupNameFor(groupId) }
          : item,
      ),
    );
    setNotice(
      `${checked.size} selected item${checked.size === 1 ? "" : "s"} moved.`,
    );
    setChecked(new Set());
    setBulkMode(null);
  };
  const applyBulkOwner = (owner: string) => {
    setItems((current) =>
      current.map((item) =>
        checked.has(item.id)
          ? { ...item, owner, initials: initialsFor(owner) }
          : item,
      ),
    );
    setNotice(
      `${checked.size} selected item${checked.size === 1 ? "" : "s"} assigned to ${owner}.`,
    );
    setChecked(new Set());
    setBulkMode(null);
  };

  return (
    <WorkspaceFrame active="workspace" workspaceSlug={workspace.slug}>
      <main className="board-main">
        {notice && (
          <div
            className={`workflow-toast success-toast board-toast${selected ? " with-item-panel" : ""}`}
            role="status"
          >
            <CheckCircle2 size={15} />
            <span>{notice}</span>
            <button
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X size={13} />
            </button>
          </div>
        )}
        <header className="board-header">
          <div className="board-title-wrap">
            <p>{`${workspace.name} / ${board.category}`}</p>
            <div>
              <span className="board-mark">{workspace.icon}</span>
              <h1>{board.name}</h1>
              <Hint resourceId="boards" />
              <span className="board-menu-wrap">
                <button
                  aria-expanded={boardMenuOpen}
                  aria-label="Board menu"
                  onClick={() => setBoardMenuOpen((current) => !current)}
                >
                  <MoreHorizontal size={18} />
                </button>
                {boardMenuOpen && (
                  <span className="board-action-menu" role="menu">
                    <button
                      role="menuitem"
                      onClick={() => {
                        void navigator.clipboard.writeText(
                          window.location.href,
                        );
                        setNotice("Board link copied.");
                        setBoardMenuOpen(false);
                      }}
                    >
                      <Copy size={13} /> Copy board link
                    </button>
                    <Link href={workspaceHref(workspace.slug)} role="menuitem">
                      Open workspace overview
                    </Link>
                  </span>
                )}
              </span>
            </div>
            <small>{board.description}</small>
          </div>
          <div className="board-header-actions">
            <button
              aria-expanded={teamOpen}
              onClick={() => setTeamOpen((current) => !current)}
            >
              <Users size={15} />
              <span className="avatar-stack">
                <i>MZ</i>
                <i>NK</i>
                <i>+3</i>
              </span>
            </button>
            <button onClick={() => setAutomationOpen(true)}>
              <SlidersHorizontal size={15} />
              {copy.automate}
            </button>
            <button className="primary-button" onClick={() => addItem()}>
              <Plus size={16} />
              {copy.addItem}
            </button>
          </div>
        </header>
        {teamOpen && (
          <section className="board-people-popover" aria-label="Board members">
            <strong>Board members</strong>
            {[
              workspace.lead.name,
              "Mohammed Zaman",
              "Nora Klein",
              "Amira Demir",
            ]
              .filter((name, index, all) => all.indexOf(name) === index)
              .map((name) => (
                <span key={name}>
                  <i className="avatar avatar-mz">{initialsFor(name)}</i>
                  {name}
                </span>
              ))}
            <Link href={workspaceHref(workspace.slug, "team")}>
              Manage team
            </Link>
          </section>
        )}
        <div className="view-toolbar">
          <div className="view-switch">
            <button
              className={view === "table" ? "active" : ""}
              onClick={() => setView("table")}
            >
              <LayoutList size={15} />
              {copy.table}
            </button>
            <button
              className={view === "kanban" ? "active" : ""}
              onClick={() => setView("kanban")}
            >
              <Columns3 size={15} />
              {copy.kanban}
            </button>
          </div>
          <span className="toolbar-rule" />
          <button
            aria-pressed={filtersOpen}
            onClick={() => setFiltersOpen((current) => !current)}
          >
            <Filter size={14} />
            {copy.filter}
          </button>
          <button
            onClick={() =>
              setCollapsedGroups((current) =>
                current.size
                  ? new Set()
                  : new Set(items.map((item) => item.groupId)),
              )
            }
          >
            <Rows3 size={14} />
            {copy.group}
          </button>
          <button
            aria-pressed={showCounts}
            onClick={() => setShowCounts((current) => !current)}
          >
            <SlidersHorizontal size={14} />
            {copy.fields}
          </button>
          <span className="saved-view">
            <Check size={13} />
            {copy.viewSaved}
          </span>
          <div className="board-progress">
            <span>
              <i style={{ width: `${progress}%` }} />
            </span>
            <b>
              {progress}% ready · {items.length} items
            </b>
          </div>
        </div>
        {filtersOpen && (
          <section className="board-filter-panel" aria-label="Board filters">
            <label>
              Search
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a work item…"
                value={query}
              />
            </label>
            <label>
              Status
              <select
                onChange={(event) =>
                  setStatusFilter(event.target.value as Status | "all")
                }
                value={statusFilter}
              >
                <option value="all">All statuses</option>
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Owner
              <select
                onChange={(event) => setOwnerFilter(event.target.value)}
                value={ownerFilter}
              >
                <option value="all">All owners</option>
                {owners.map((owner) => (
                  <option key={owner}>{owner}</option>
                ))}
              </select>
            </label>
            <button
              onClick={() => {
                setQuery("");
                setStatusFilter("all");
                setOwnerFilter("all");
              }}
            >
              Clear filters
            </button>
            <span>
              {visibleItems.length} of {items.length} items
            </span>
          </section>
        )}
        {checked.size > 0 && (
          <div className="bulk-bar">
            <strong>
              {checked.size} {copy.selected}
            </strong>
            <button
              onClick={() => setBulkMode(bulkMode === "move" ? null : "move")}
            >
              {copy.bulkMove}
            </button>
            <button
              onClick={() =>
                setBulkMode(bulkMode === "assign" ? null : "assign")
              }
            >
              {copy.assign}
            </button>
            {bulkMode === "move" && (
              <select
                aria-label="Move selected items"
                defaultValue=""
                onChange={(event) =>
                  event.target.value && applyBulkMove(event.target.value)
                }
              >
                <option disabled value="">
                  Choose group…
                </option>
                {boardGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
                <option value={UNGROUPED_ID}>Ungrouped</option>
              </select>
            )}
            {bulkMode === "assign" && (
              <select
                aria-label="Assign selected items"
                defaultValue=""
                onChange={(event) =>
                  event.target.value && applyBulkOwner(event.target.value)
                }
              >
                <option disabled value="">
                  Choose owner…
                </option>
                {[
                  workspace.lead.name,
                  "Mohammed Zaman",
                  "Nora Klein",
                  "Amira Demir",
                  "Unassigned",
                ]
                  .filter((name, index, all) => all.indexOf(name) === index)
                  .map((owner) => (
                    <option key={owner}>{owner}</option>
                  ))}
              </select>
            )}
            <button onClick={() => setChecked(new Set())}>{copy.clear}</button>
          </div>
        )}
        {view === "table" ? (
          <DndContext
            id={`trevv-${board.id}`}
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <div className="board-table-wrap">
              <table className="board-table">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <th key={header.id} style={{ width: header.getSize() }}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <SortableContext
                  items={visibleItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {/* Group bands: the device that keeps a long board
                        readable. A header row opens each band, and its rows
                        stay draggable inside the same sortable context. */}
                    {table.getRowModel().rows.map((row, index, rows) => {
                      const groupId = row.original.groupId;
                      const isFirstOfGroup =
                        index === 0 ||
                        rows[index - 1]?.original.groupId !== groupId;
                      const isLastOfGroup =
                        index === rows.length - 1 ||
                        rows[index + 1]?.original.groupId !== groupId;
                      const size = rows.filter(
                        (candidate) => candidate.original.groupId === groupId,
                      ).length;
                      const collapsed = collapsedGroups.has(groupId);
                      return (
                        <Fragment key={row.id}>
                          {isFirstOfGroup && (
                            <tr className="group-row">
                              <td colSpan={8}>
                                <button
                                  className="group-header"
                                  aria-expanded={!collapsed}
                                  style={
                                    {
                                      "--group-color": groupColor(groupId),
                                    } as React.CSSProperties
                                  }
                                  onClick={() => toggleGroup(groupId)}
                                >
                                  <ChevronDown
                                    size={15}
                                    className={collapsed ? "rotated" : ""}
                                  />
                                  <span className="group-name">
                                    {row.original.group}
                                  </span>
                                  <span className="group-count">
                                    {size} {size === 1 ? "item" : "items"}
                                  </span>
                                </button>
                              </td>
                            </tr>
                          )}
                          {!collapsed && <SortableTableRow row={row} />}
                          {isLastOfGroup && (
                            <GroupSummaryRow
                              items={rows
                                .filter(
                                  (candidate) =>
                                    candidate.original.groupId === groupId,
                                )
                                .map((candidate) => candidate.original)}
                            />
                          )}
                        </Fragment>
                      );
                    })}
                    <tr className="add-row">
                      <td />
                      <td colSpan={7}>
                        <button
                          onClick={() => addItem("planned", boardGroups[0]?.id)}
                        >
                          <Plus size={14} />
                          {copy.addBelow}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </SortableContext>
              </table>
            </div>
          </DndContext>
        ) : (
          <Kanban
            items={items}
            updateItem={updateItem}
            onSelect={setSelected}
            onAdd={addItem}
          />
        )}
        <p className="drag-hint">{copy.dragHint}</p>
        {automationOpen && (
          <div
            className="dialog-layer"
            role="presentation"
            onMouseDown={() => setAutomationOpen(false)}
          >
            <section
              className="capture-dialog automation-preview-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="automation-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header>
                <span className="attention-icon">
                  <SlidersHorizontal size={16} />
                </span>
                <div>
                  <h2 id="automation-title">Board automation</h2>
                  <p>Preview a safe rule before enabling it.</p>
                </div>
                <button
                  aria-label="Close automation"
                  onClick={() => setAutomationOpen(false)}
                >
                  <X size={17} />
                </button>
              </header>
              <div className="automation-rule-preview">
                <strong>When an item moves to Done</strong>
                <span>Record a completion update and notify followers.</span>
                <label>
                  <input
                    checked={automationEnabled}
                    onChange={(event) =>
                      setAutomationEnabled(event.target.checked)
                    }
                    type="checkbox"
                  />
                  Enable this preview rule
                </label>
              </div>
              <footer>
                <span>
                  Advanced custom automations remain a later-release capability.
                </span>
                <button
                  className="primary-button"
                  onClick={() => {
                    setAutomationOpen(false);
                    setNotice(
                      automationEnabled
                        ? "Board automation enabled."
                        : "Automation preview saved without enabling.",
                    );
                  }}
                >
                  Save automation
                </button>
              </footer>
            </section>
          </div>
        )}
      </main>
      {selected && (
        <ItemPanel
          item={items.find((item) => item.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          updateItem={updateItem}
          workspaceName={workspace.name}
          boardName={board.name}
          dependencyTitle={dependencyTitle}
          onNotice={setNotice}
        />
      )}
    </WorkspaceFrame>
  );
}

const STATUS_COLORS: Record<Status, string> = {
  planned: "var(--fh-parked)",
  working: "var(--fh-warning)",
  blocked: "var(--fh-danger)",
  review: "var(--fh-info)",
  done: "var(--fh-success)",
};

const PRIORITY_COLORS: Record<Priority, string> = {
  Urgent: "var(--fh-danger)",
  High: "var(--fh-warning)",
  Normal: "var(--fh-info)",
  Low: "var(--fh-parked)",
};

/**
 * The aggregation row under each group. Status and priority arrive as
 * distribution bars because the mix is the interesting part; dates arrive as
 * a range; counts sum. Every bar carries its numbers in the tooltip and the
 * accessible name, so none of it depends on colour.
 */
function GroupSummaryRow({ items }: { items: BoardItem[] }) {
  const statusSlices = (Object.keys(STATUS_COLORS) as Status[])
    .map((key) => ({
      key,
      label: statusLabel[key],
      color: STATUS_COLORS[key],
      value: items.filter((item) => item.status === key).length,
    }))
    .filter((slice) => slice.value > 0);

  const prioritySlices = (Object.keys(PRIORITY_COLORS) as Priority[])
    .map((key) => ({
      key,
      label: key,
      color: PRIORITY_COLORS[key],
      value: items.filter((item) => item.priority === key).length,
    }))
    .filter((slice) => slice.value > 0);

  const dated = items
    .filter((item) => item.dueDate)
    .sort((left, right) => left.dueDate!.localeCompare(right.dueDate!));
  const dueRange =
    dated.length === 0
      ? "—"
      : dated.length === 1 || dated[0]!.due === dated[dated.length - 1]!.due
        ? dated[0]!.due
        : `${dated[0]!.due} – ${dated[dated.length - 1]!.due}`;

  const owners = new Set(
    items
      .filter((item) => item.owner !== "Unassigned")
      .map((item) => item.owner),
  ).size;
  const resources = items.reduce((sum, item) => sum + item.resources, 0);
  const updates = items.reduce((sum, item) => sum + item.updates, 0);

  return (
    <tr className="summary-row">
      <td />
      <td>
        <span className="summary-count">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </td>
      <td>
        <span className="summary-cell">
          {owners} {owners === 1 ? "owner" : "owners"}
        </span>
      </td>
      <td>
        <DistributionBar slices={statusSlices} title="Status mix" />
      </td>
      <td>
        <DistributionBar slices={prioritySlices} title="Priority mix" />
      </td>
      <td>
        <span className="summary-pill">{dueRange}</span>
      </td>
      <td>
        <span className="summary-cell">
          {resources} {resources === 1 ? "file" : "files"}
        </span>
      </td>
      <td>
        <span className="summary-cell">
          {updates} {updates === 1 ? "update" : "updates"}
        </span>
      </td>
    </tr>
  );
}

function SortableTableRow({ row }: { row: LegacyRow<BoardItem> }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.original.id });
  return (
    <tr
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "dragging" : ""}
    >
      {row.getVisibleCells().map((cell, index) => (
        <td key={cell.id}>
          {index === 0 ? (
            <span className="select-cell">
              <button
                type="button"
                className="row-grip"
                {...attributes}
                {...listeners}
                aria-label={`Reorder ${row.original.title}`}
              >
                <GripVertical size={14} />
              </button>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          ) : (
            flexRender(cell.column.columnDef.cell, cell.getContext())
          )}
        </td>
      ))}
    </tr>
  );
}

function Kanban({
  items,
  updateItem,
  onSelect,
  onAdd,
}: {
  items: BoardItem[];
  updateItem: (id: string, patch: Partial<BoardItem>) => void;
  onSelect: (item: BoardItem) => void;
  onAdd: (status?: Status, groupId?: string) => void;
}) {
  const statuses: Status[] = [
    "planned",
    "working",
    "blocked",
    "review",
    "done",
  ];
  return (
    <div className="kanban-board">
      {statuses.map((status, statusIndex) => (
        <section className={`kanban-column kanban-${status}`} key={status}>
          <header>
            <span className={`type-dot ${status}`} />
            <strong>{statusLabel[status]}</strong>
            <b>{items.filter((item) => item.status === status).length}</b>
            <button
              aria-label={`Add item to ${statusLabel[status]}`}
              onClick={() => onAdd(status)}
            >
              <Plus size={14} />
            </button>
          </header>
          <div>
            {items
              .filter((item) => item.status === status)
              .map((item) => {
                const nextStatus = statuses[statusIndex + 1];
                return (
                  <article className="kanban-card" key={item.id}>
                    <button
                      className="kanban-card-title"
                      onClick={() => onSelect(item)}
                    >
                      {item.title}
                    </button>
                    <div>
                      <span
                        className={`priority-flag priority-${item.priority.toLowerCase()}`}
                      >
                        {item.priority}
                      </span>
                      <span className="avatar avatar-mz">{item.initials}</span>
                    </div>
                    <footer>
                      <span>
                        <CalendarDays size={12} />
                        {item.due}
                      </span>
                      <span>
                        <MessageSquare size={12} />
                        {item.updates}
                      </span>
                      {nextStatus && (
                        <button
                          onClick={() =>
                            updateItem(item.id, { status: nextStatus })
                          }
                          aria-label={`Move ${item.title} to ${statusLabel[nextStatus]}`}
                        >
                          →
                        </button>
                      )}
                    </footer>
                  </article>
                );
              })}
            <button className="kanban-add" onClick={() => onAdd(status)}>
              <Plus size={14} />
              Add item
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}

function ItemPanel({
  item,
  onClose,
  updateItem,
  workspaceName,
  boardName,
  dependencyTitle,
  onNotice,
}: {
  item: BoardItem;
  onClose: () => void;
  updateItem: (id: string, patch: Partial<BoardItem>) => void;
  workspaceName: string;
  boardName: string;
  dependencyTitle: string;
  onNotice: (message: string) => void;
}) {
  const copy = productCopy.en.item;
  const [subitems, setSubitems] = useState([
    { title: `${item.title} acceptance criteria confirmed`, done: true },
    { title: "Supporting evidence attached", done: false },
    { title: "Outcome recorded in the Workspace update", done: false },
  ]);
  const [comment, setComment] = useState("");
  const [newSubitem, setNewSubitem] = useState("");
  const [addingSubitem, setAddingSubitem] = useState(false);
  const [following, setFollowing] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [linkDraft, setLinkDraft] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const people = ["Mohammed", "Nora", "Amira", "Elias", "Unassigned"];
  return (
    <aside className="item-panel" aria-label={item.title}>
      <header>
        <div>
          <span className="item-type">
            <CheckCircle2 size={13} />
            {copy.type}
          </span>
          <span className="save-state">
            <Check size={12} />
            {copy.changesSaved}
          </span>
        </div>
        <div>
          <button
            aria-label={copy.copyLink}
            onClick={() => {
              const url = `${window.location.origin}${window.location.pathname}#${item.id}`;
              void navigator.clipboard.writeText(url);
              onNotice("Item link copied.");
            }}
          >
            <Copy size={16} />
          </button>
          <button
            aria-expanded={moreOpen}
            aria-label={copy.more}
            onClick={() => setMoreOpen((current) => !current)}
          >
            <MoreHorizontal size={17} />
          </button>
          <button aria-label={copy.close} onClick={onClose}>
            <X size={18} />
          </button>
          {moreOpen && (
            <div className="item-action-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  void navigator.clipboard.writeText(item.title);
                  onNotice("Item title copied.");
                  setMoreOpen(false);
                }}
              >
                Copy title
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  updateItem(item.id, { status: "blocked" });
                  onNotice("Item marked blocked.");
                  setMoreOpen(false);
                }}
              >
                Mark blocked
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="item-panel-scroll">
        <div className="item-title-block">
          <textarea
            aria-label="Item title"
            value={item.title}
            onChange={(event) =>
              updateItem(item.id, { title: event.target.value })
            }
          />
          <button
            className="complete-button"
            onClick={() => updateItem(item.id, { status: "done" })}
          >
            <Circle size={15} />
            {copy.complete}
          </button>
        </div>
        <section className="property-grid" aria-label={copy.properties}>
          <span>
            <UserRound size={14} />
            {copy.assignees}
          </span>
          <label className="property-select-control">
            <span className="avatar avatar-mz">{item.initials}</span>
            <select
              aria-label={`Owner for ${item.title}`}
              onChange={(event) =>
                updateItem(item.id, {
                  owner: event.target.value,
                  initials: initialsFor(event.target.value),
                })
              }
              value={item.owner}
            >
              {[item.owner, ...people]
                .filter((name, index, all) => all.indexOf(name) === index)
                .map((name) => (
                  <option key={name}>{name}</option>
                ))}
            </select>
            <ChevronDown size={13} />
          </label>
          <span>
            <Circle size={14} />
            Status
          </span>
          <select
            aria-label={`Status for ${item.title}`}
            className={`status-select status-${item.status}`}
            value={item.status}
            onChange={(event) =>
              updateItem(item.id, { status: event.target.value as Status })
            }
          >
            {Object.entries(statusLabel).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          <span>
            <SlidersHorizontal size={14} />
            Priority
          </span>
          <select
            aria-label={`Priority for ${item.title}`}
            className={`priority-select priority-${item.priority.toLowerCase()}`}
            value={item.priority}
            onChange={(event) =>
              updateItem(item.id, { priority: event.target.value as Priority })
            }
          >
            {["Urgent", "High", "Normal", "Low"].map((priority) => (
              <option key={priority}>{priority}</option>
            ))}
          </select>
          <span>
            <CalendarDays size={14} />
            {copy.dates}
          </span>
          <input
            aria-label={`Due date for ${item.title}`}
            type="date"
            value={item.dueDate ?? ""}
            onChange={(event) =>
              updateItem(item.id, {
                dueDate: event.target.value || undefined,
                due: formatDueDate(event.target.value || undefined),
              })
            }
          />
          <span>
            <Link2 size={14} />
            {copy.dependency}
          </span>
          <button
            onClick={() =>
              onNotice(
                dependencyTitle === "No dependency"
                  ? "This item has no linked dependency."
                  : `Dependency: ${dependencyTitle}`,
              )
            }
          >
            {dependencyTitle}
            <ExternalLink size={12} />
          </button>
        </section>
        <section className="panel-section">
          <h3>{copy.description}</h3>
          <div
            className="description-editor"
            role="textbox"
            aria-label={copy.description}
            contentEditable
            suppressContentEditableWarning
          >
            {item.description}
          </div>
        </section>
        <section className="panel-section">
          <div className="panel-section-title">
            <h3>{copy.checklist}</h3>
            <span>
              {subitems.filter((subitem) => subitem.done).length}/
              {subitems.length}
            </span>
          </div>
          <div className="subitem-progress">
            <i
              style={{
                width: `${(subitems.filter((subitem) => subitem.done).length / subitems.length) * 100}%`,
              }}
            />
          </div>
          <ul className="subitem-list">
            {subitems.map((subitem, index) => (
              <li key={subitem.title}>
                <button
                  aria-label={`${subitem.done ? "Reopen" : "Complete"} ${subitem.title}`}
                  onClick={() =>
                    setSubitems((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, done: !candidate.done }
                          : candidate,
                      ),
                    )
                  }
                >
                  {subitem.done ? (
                    <CheckCircle2 className="checked" size={16} />
                  ) : (
                    <Circle size={16} />
                  )}
                </button>
                <span className={subitem.done ? "done" : ""}>
                  {subitem.title}
                </span>
              </li>
            ))}
          </ul>
          {addingSubitem ? (
            <form
              className="subitem-create"
              onSubmit={(event) => {
                event.preventDefault();
                if (!newSubitem.trim()) return;
                setSubitems((current) => [
                  ...current,
                  { title: newSubitem.trim(), done: false },
                ]);
                setNewSubitem("");
                setAddingSubitem(false);
              }}
            >
              <input
                autoFocus
                aria-label="New checklist item"
                onChange={(event) => setNewSubitem(event.target.value)}
                placeholder="Describe the next checklist step"
                value={newSubitem}
              />
              <button disabled={!newSubitem.trim()} type="submit">
                Add
              </button>
              <button onClick={() => setAddingSubitem(false)} type="button">
                Cancel
              </button>
            </form>
          ) : (
            <button
              className="text-action"
              onClick={() => setAddingSubitem(true)}
            >
              <Plus size={14} />
              {copy.addSubitem}
            </button>
          )}
        </section>
        <section className="panel-section">
          <h3>{copy.links}</h3>
          <a
            className="resource-card"
            href="https://www.figma.com"
            target="_blank"
            rel="noreferrer"
          >
            <span className="resource-icon">F</span>
            <div>
              <strong>{item.title} — working file</strong>
              <span>{workspaceName} · Design resource</span>
            </div>
            <ExternalLink size={14} />
          </a>
          <a
            className="resource-card"
            href="https://docs.google.com"
            target="_blank"
            rel="noreferrer"
          >
            <span className="resource-icon docs">
              <FileText size={16} />
            </span>
            <div>
              <strong>{boardName} evidence</strong>
              <span>Google Docs · Project resource</span>
            </div>
            <ExternalLink size={14} />
          </a>
        </section>
        <section className="panel-section">
          <div className="panel-section-title">
            <h3>{copy.activity}</h3>
            <button
              aria-pressed={following}
              onClick={() => {
                setFollowing((current) => !current);
                onNotice(
                  following
                    ? "You are no longer following this item."
                    : "You are now following this item.",
                );
              }}
            >
              {following ? copy.following : "Follow"}
              <ChevronDown size={12} />
            </button>
          </div>
          <div className="activity-item">
            <span className="avatar avatar-ad">AD</span>
            <p>
              <strong>{item.owner}</strong> updated this item
              <span>Today at 10:24</span>
            </p>
          </div>
          <div className="activity-item">
            <span className="activity-status-dot" />
            <p>
              Current status is <strong>{statusLabel[item.status]}</strong>
              <span>Yesterday at 16:40</span>
            </p>
          </div>
        </section>
      </div>
      <footer className="comment-composer">
        <span className="avatar avatar-mz">MZ</span>
        <div>
          <textarea
            aria-label={copy.addComment}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={copy.addComment}
          />
          {attachments.length > 0 && (
            <small className="comment-attachments">
              {attachments.join(", ")}
            </small>
          )}
          {addingLink && (
            <input
              aria-label="Link to add"
              autoFocus
              onChange={(event) => setLinkDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && linkDraft.trim()) {
                  event.preventDefault();
                  setAttachments((current) => [...current, linkDraft.trim()]);
                  setLinkDraft("");
                  setAddingLink(false);
                }
              }}
              placeholder="Paste a URL and press Enter"
              type="url"
              value={linkDraft}
            />
          )}
          <span>
            <input
              hidden
              multiple
              onChange={(event) =>
                setAttachments((current) => [
                  ...current,
                  ...Array.from(event.target.files ?? []).map(
                    (file) => file.name,
                  ),
                ])
              }
              ref={fileInputRef}
              type="file"
            />
            <button
              aria-label="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={14} />
            </button>
            <button
              aria-label="Add link"
              onClick={() => setAddingLink((current) => !current)}
            >
              <Link2 size={14} />
            </button>
            <button
              aria-label="Mention teammate"
              onClick={() =>
                setComment(
                  (current) => `${current}${current ? " " : ""}@${item.owner} `,
                )
              }
            >
              <span>@</span>
            </button>
            <button
              className="send-button"
              disabled={!comment}
              onClick={() => {
                updateItem(item.id, { updates: item.updates + 1 });
                setComment("");
                setAttachments([]);
                setAddingLink(false);
                setLinkDraft("");
                onNotice("Comment posted to the item activity.");
              }}
            >
              <Send size={14} />
              {copy.send}
            </button>
          </span>
        </div>
      </footer>
    </aside>
  );
}
