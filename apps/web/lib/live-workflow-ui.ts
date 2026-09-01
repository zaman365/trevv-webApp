import type { WorkItemDto } from "@founderhq/api-contract";

export const LIVE_DRAFT_STORAGE_PREFIX = "trevv:live-draft:v1:";

export interface LiveDraftEnvelope<T> {
  version: 1;
  idempotencyKey: string;
  payload: T;
  updatedAt: string;
}

export function liveDraftStorageKey({
  organizationId,
  userId,
  scope,
}: {
  organizationId: string;
  userId: string;
  scope: string;
}) {
  const safe = (value: string) =>
    encodeURIComponent(value.trim().toLocaleLowerCase());
  return `${LIVE_DRAFT_STORAGE_PREFIX}${safe(organizationId)}:${safe(userId)}:${safe(scope)}`;
}

export function clearLiveDraftStorage(
  storage: Pick<Storage, "key" | "length" | "removeItem">,
) {
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(LIVE_DRAFT_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return keys.length;
  } catch {
    // A hardened browser can deny storage access. Session termination must
    // still complete; no private response is copied into another cache.
    return 0;
  }
}

export function isLiveDraftEnvelope<T>(
  value: unknown,
  isPayload: (payload: unknown) => payload is T,
): value is LiveDraftEnvelope<T> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LiveDraftEnvelope<unknown>>;
  return (
    candidate.version === 1 &&
    typeof candidate.idempotencyKey === "string" &&
    candidate.idempotencyKey.length > 0 &&
    typeof candidate.updatedAt === "string" &&
    Number.isFinite(Date.parse(candidate.updatedAt)) &&
    isPayload(candidate.payload)
  );
}

export function workspaceSlugFromName(
  name: string,
  existingSlugs: readonly string[],
) {
  const base =
    name
      .trim()
      .toLocaleLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "workspace";
  const existing = new Set(existingSlugs);
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export function workspaceItems(
  items: readonly WorkItemDto[],
  workspaceId: string,
) {
  return items.filter((item) => item.workspaceId === workspaceId);
}

export function openWorkspaceItems(
  items: readonly WorkItemDto[],
  workspaceId: string,
) {
  return workspaceItems(items, workspaceId).filter(
    (item) => item.status !== "done",
  );
}

export function formatLiveDate(
  value: string,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
) {
  return new Intl.DateTimeFormat(undefined, {
    ...options,
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatLiveDateOnly(value: string, timezone: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T12:00:00Z`
    : value;
  return formatLiveDate(normalized, timezone, {
    dateStyle: "medium",
  });
}

export function formatCompactWorkspaceDate(value: string) {
  const parsed = new Date(`${value}T12:00:00`);
  if (!value || Number.isNaN(parsed.valueOf())) return "Not scheduled";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

export function workItemStatusLabel(status: WorkItemDto["status"]) {
  return status.replaceAll("_", " ");
}

export function isRecoverableLiveError(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const status = (error as { status?: unknown }).status;
  return typeof status !== "number" || status >= 500 || status === 429;
}
