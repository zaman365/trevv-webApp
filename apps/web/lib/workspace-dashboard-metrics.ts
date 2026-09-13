import type { WorkItemDto } from "@founderhq/api-contract";

export const dashboardStatuses = [
  { key: "not_started", label: "Not started", color: "#8792a8" },
  { key: "working", label: "In progress", color: "#7465e8" },
  { key: "review", label: "In review", color: "#2786b9" },
  { key: "blocked", label: "Blocked", color: "#d64a68" },
  { key: "done", label: "Done", color: "#21997c" },
] as const;

export function dashboardDayAfter(day: string, offset: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dashboardMetrics(
  items: readonly WorkItemDto[],
  today: string,
  days: number,
) {
  const unique = [...new Map(items.map((item) => [item.id, item])).values()];
  const statusCounts = new Map<string, number>();
  const owners = new Map<
    string,
    { id: string; name: string; open: number; blocked: number; overdue: number }
  >();
  const dateCounts = new Map<string, number>();
  let overdue = 0,
    unassigned = 0,
    undated = 0;
  for (const item of unique) {
    statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
    if (item.status === "done") continue;
    const late = Boolean(item.dueDate && item.dueDate < today);
    if (late) overdue++;
    if (!item.dueDate) undated++;
    else dateCounts.set(item.dueDate, (dateCounts.get(item.dueDate) ?? 0) + 1);
    if (!item.assignees.length) unassigned++;
    const people = item.assignees.length
      ? [
          ...new Map(
            item.assignees.map((person) => [person.id, person]),
          ).values(),
        ]
      : [{ id: "unassigned", name: "Unassigned" }];
    for (const person of people) {
      const row = owners.get(person.id) ?? {
        ...person,
        open: 0,
        blocked: 0,
        overdue: 0,
      };
      row.open++;
      if (item.status === "blocked") row.blocked++;
      if (late) row.overdue++;
      owners.set(person.id, row);
    }
  }
  const done = statusCounts.get("done") ?? 0;
  const statuses = dashboardStatuses.map((status) => ({
    ...status,
    count: statusCounts.get(status.key) ?? 0,
  }));
  return {
    total: unique.length,
    open: unique.length - done,
    done,
    overdue,
    unassigned,
    undated,
    blocked: statusCounts.get("blocked") ?? 0,
    completion: unique.length ? Math.round((done / unique.length) * 100) : 0,
    statuses,
    owners: [...owners.values()].sort(
      (a, b) => b.open - a.open || a.name.localeCompare(b.name),
    ),
    deadlines: Array.from({ length: days }, (_, offset) => {
      const date = dashboardDayAfter(today, offset);
      return { date, count: dateCounts.get(date) ?? 0 };
    }),
    milestones: unique
      .filter((item) => item.type === "milestone" && item.status !== "done")
      .sort(
        (a, b) =>
          (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
          a.title.localeCompare(b.title),
      ),
  };
}
