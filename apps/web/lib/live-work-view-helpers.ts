import type { WorkItemDto } from "@founderhq/api-contract";
export const recordKey = (record: { id: string }) => record.id;

export function retainedKey(keys: Map<string, string>, fingerprint: string) {
  const existing = keys.get(fingerprint);
  if (existing) return existing;
  const created = crypto.randomUUID();
  keys.set(fingerprint, created);
  return created;
}

export function editableStatusOptions(current: WorkItemDto["status"]) {
  const editable = ["not_started", "working", "review"] as const;
  return new Set<WorkItemDto["status"]>(editable).has(current)
    ? [...editable]
    : [current, ...editable];
}
