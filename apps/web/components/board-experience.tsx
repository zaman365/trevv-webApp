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
  boardForHub,
  calculateWorkProgress,
  hubBySlug,
  itemsForBoard,
  type Board,
  type Hub,
  type WorkItem,
} from "@founderhq/core";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { WorkspaceFrame } from "./workspace-frame";
import { productCopy } from "@/lib/product-copy";

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
  resources: number;
  updates: number;
  description: string;
  group: string;
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
  resources: 0,
  updates: 0,
  description: descriptionFor(item),
  group:
    item.type === "decision" || item.type === "milestone"
      ? "Milestones & decisions"
      : item.type === "approval"
        ? "Approvals"
        : "Execution",
});

const statusLabel: Record<Status, string> = {
  planned: "Planned",
  working: "Working",
  blocked: "Blocked",
  review: "Review",
  done: "Done",
};

export function BoardExperience({
  hubSlug,
  boardId,
}: {
  hubSlug: string;
  boardId: string;
}) {
  const hub = hubBySlug(hubSlug);
  const board = hub ? boardForHub(hub.id, boardId) : undefined;
  if (!hub || !board)
    return (
      <WorkspaceFrame active="hub" hubSlug={hubSlug}>
        <main className="board-main board-not-found">
          <h1>Board not found</h1>
          <p>This board does not belong to the requested Hub.</p>
          <Link href={hub ? `/app/hubs/${hub.slug}` : "/app/hubs"}>
            Return to {hub?.name ?? "All Hubs"}
          </Link>
        </main>
      </WorkspaceFrame>
    );
  return (
    <BoardWorkspace
      key={`${hub.id}:${board.id}`}
      hub={hub}
      board={board}
      sourceItems={itemsForBoard(board.id)}
    />
  );
}

function BoardWorkspace({
  hub,
  board,
  sourceItems,
}: {
  hub: Hub;
  board: Board;
  sourceItems: WorkItem[];
}) {
  const copy = productCopy.en.board;
  const seedItems = useMemo(() => sourceItems.map(toBoardItem), [sourceItems]);
  const [items, setItems] = useState(seedItems);
  const [view, setView] = useState<"table" | "kanban">("table");
  const [selected, setSelected] = useState<BoardItem | null>(
    seedItems[0] ?? null,
  );
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [storageReady, setStorageReady] = useState(false);
  const storageKey = `trevv:board:${board.id}`;
  useEffect(() => {
    let storedItems: BoardItem[] | null = null;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as BoardItem[];
        const allowedIds = new Set(seedItems.map((item) => item.id));
        const valid = parsed.filter((item) => allowedIds.has(item.id));
        if (valid.length === seedItems.length) storedItems = valid;
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
  const columns = useMemo<LegacyColumnDef<BoardItem>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <span className="select-cell">
            <input
              aria-label="Select all"
              type="checkbox"
              checked={checked.size === items.length && items.length > 0}
              onChange={(event) =>
                setChecked(
                  event.target.checked
                    ? new Set(items.map((item) => item.id))
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
          <button className="owner-cell">
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
          <button className="count-cell">
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
          <button className="count-cell">
            <MessageSquare size={13} />
            {row.original.updates}
          </button>
        ),
        size: 80,
      },
    ],
    [checked, items, copy],
  );
  const table = useLegacyTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
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
      hub.progressMode ?? "task_completion",
    ) ?? 0;
  const dependencyTitle =
    items.find((item) =>
      sourceItems.find(
        (source) => source.id === item.id && source.type === "milestone",
      ),
    )?.title ?? "No dependency";

  return (
    <WorkspaceFrame active="hub" hubSlug={hub.slug}>
      <main className="board-main">
        <header className="board-header">
          <div className="board-title-wrap">
            <p>{`${hub.name} / ${board.category}`}</p>
            <div>
              <span className="board-mark">{hub.icon}</span>
              <h1>{board.name}</h1>
              <button aria-label="Board menu">
                <MoreHorizontal size={18} />
              </button>
            </div>
            <small>{board.description}</small>
          </div>
          <div className="board-header-actions">
            <button>
              <Users size={15} />
              <span className="avatar-stack">
                <i>MZ</i>
                <i>NK</i>
                <i>+3</i>
              </span>
            </button>
            <button>
              <SlidersHorizontal size={15} />
              {copy.automate}
            </button>
            <button className="primary-button">
              <Plus size={16} />
              {copy.addItem}
            </button>
          </div>
        </header>
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
          <button>
            <Filter size={14} />
            {copy.filter}
          </button>
          <button>
            <Rows3 size={14} />
            {copy.group}
          </button>
          <button>
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
        {checked.size > 0 && (
          <div className="bulk-bar">
            <strong>
              {checked.size} {copy.selected}
            </strong>
            <button>{copy.bulkMove}</button>
            <button>{copy.assign}</button>
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
                  items={items.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <SortableTableRow row={row} key={row.id} />
                    ))}
                    <tr className="add-row">
                      <td />
                      <td colSpan={7}>
                        <button>
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
          />
        )}
        <p className="drag-hint">{copy.dragHint}</p>
      </main>
      {selected && (
        <ItemPanel
          item={items.find((item) => item.id === selected.id) ?? selected}
          onClose={() => setSelected(null)}
          updateItem={updateItem}
          hubName={hub.name}
          boardName={board.name}
          dependencyTitle={dependencyTitle}
        />
      )}
    </WorkspaceFrame>
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
}: {
  items: BoardItem[];
  updateItem: (id: string, patch: Partial<BoardItem>) => void;
  onSelect: (item: BoardItem) => void;
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
            <button>
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
            <button className="kanban-add">
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
  hubName,
  boardName,
  dependencyTitle,
}: {
  item: BoardItem;
  onClose: () => void;
  updateItem: (id: string, patch: Partial<BoardItem>) => void;
  hubName: string;
  boardName: string;
  dependencyTitle: string;
}) {
  const copy = productCopy.en.item;
  const [subitems, setSubitems] = useState([
    { title: `${item.title} acceptance criteria confirmed`, done: true },
    { title: "Supporting evidence attached", done: false },
    { title: "Outcome recorded in the project update", done: false },
  ]);
  const [comment, setComment] = useState("");
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
          <button aria-label={copy.copyLink}>
            <Copy size={16} />
          </button>
          <button aria-label={copy.more}>
            <MoreHorizontal size={17} />
          </button>
          <button aria-label={copy.close} onClick={onClose}>
            <X size={18} />
          </button>
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
          <button>
            <span className="avatar avatar-mz">{item.initials}</span>
            {item.owner}
            <ChevronDown size={13} />
          </button>
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
          <button>
            {item.due}
            <ChevronDown size={13} />
          </button>
          <span>
            <Link2 size={14} />
            {copy.dependency}
          </span>
          <button>
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
          <button className="text-action">
            <Plus size={14} />
            {copy.addSubitem}
          </button>
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
              <span>{hubName} · Design resource</span>
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
            <button>
              {copy.following}
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
          <span>
            <button aria-label="Attach file">
              <Paperclip size={14} />
            </button>
            <button aria-label="Add link">
              <Link2 size={14} />
            </button>
            <button aria-label="Mention teammate">
              <span>@</span>
            </button>
            <button
              className="send-button"
              disabled={!comment}
              onClick={() => setComment("")}
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
