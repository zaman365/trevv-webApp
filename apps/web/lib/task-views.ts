import type { WorkItemDto } from "@founderhq/api-contract";
import { dateTimeFormatter } from "./date-format";

export const taskPeriods = [
  "open",
  "today",
  "overdue",
  "upcoming",
  "completed",
  "all",
] as const;
export type TaskPeriod = (typeof taskPeriods)[number];
export const taskPeriodLabels: Record<TaskPeriod, string> = {
  open: "Open",
  today: "Today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  completed: "Completed",
  all: "All work",
};
export const taskStatuses: WorkItemDto["status"][] = [
  "not_started",
  "working",
  "review",
  "blocked",
  "done",
];

export function taskToday(timezone: string, now = new Date()) {
  const parts = dateTimeFormatter("en", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function taskMatchesPeriod(
  item: WorkItemDto,
  period: TaskPeriod,
  today: string,
) {
  if (period === "all") return true;
  if (period === "completed") return item.status === "done";
  if (item.status === "done") return false;
  if (period === "open") return true;
  if (!item.dueDate) return false;
  return period === "today"
    ? item.dueDate === today
    : period === "overdue"
      ? item.dueDate < today
      : item.dueDate > today;
}

const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3, none: 4 };
export function sortTasks(
  items: WorkItemDto[],
  sort: "due" | "priority" | "recent",
) {
  return [...items].sort((a, b) => {
    if (sort === "recent")
      return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
    const due = (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    const priority = priorityOrder[a.priority] - priorityOrder[b.priority];
    return (
      (sort === "priority" ? priority || due : due || priority) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
    );
  });
}
