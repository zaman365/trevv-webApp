import type { WorkItemDto } from "@founderhq/api-contract";

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
  return `trevv:live-draft:v1:${safe(organizationId)}:${safe(userId)}:${safe(scope)}`;
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

export function workItemStatusLabel(status: WorkItemDto["status"]) {
  return status.replaceAll("_", " ");
}

export function isRecoverableLiveError(error: unknown) {
  if (!error || typeof error !== "object") return true;
  const status = (error as { status?: unknown }).status;
  return typeof status !== "number" || status >= 500 || status === 429;
}
