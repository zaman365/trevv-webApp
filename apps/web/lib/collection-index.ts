/** Keep the first record for each identity without changing source order. */
export function uniqueById<T extends { id: string }>(
  records: readonly T[],
): T[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function groupByKey<T>(
  records: readonly T[],
  keyFor: (record: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const record of records) {
    const key = keyFor(record);
    const existing = grouped.get(key);
    if (existing) existing.push(record);
    else grouped.set(key, [record]);
  }
  return grouped;
}

export function countByKey<T>(
  records: readonly T[],
  keyFor: (record: T) => string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = keyFor(record);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export interface WorkspaceRollup {
  open: number;
  blocked: number;
  decisions: number;
  approvals: number;
  attention: number;
}

export function workspaceRollups(
  items: readonly { workspaceId: string; status: string; type: string }[],
  signals: readonly { workspaceId?: string | undefined }[],
): Map<string, WorkspaceRollup> {
  const rollups = new Map<string, WorkspaceRollup>();
  const get = (id: string) => {
    let value = rollups.get(id);
    if (!value) {
      value = { open: 0, blocked: 0, decisions: 0, approvals: 0, attention: 0 };
      rollups.set(id, value);
    }
    return value;
  };
  for (const item of items) {
    if (item.status === "done") continue;
    const value = get(item.workspaceId);
    value.open++;
    if (item.status === "blocked") value.blocked++;
    if (item.type === "decision") value.decisions++;
    if (item.type === "approval") value.approvals++;
  }
  for (const signal of signals) {
    if (signal.workspaceId) get(signal.workspaceId).attention++;
  }
  return rollups;
}
