import { TrevvApiError, type TrevvApiClient } from "@founderhq/api-client";
import type { AppSyncStatus } from "@founderhq/api-contract";
import type { LiveAppDataSnapshot } from "./live-app-data";

export interface LiveAppAccessSnapshot extends AppSyncStatus {
  checkedAt: string;
}
export interface AppIdentity {
  userId: string;
  organizationId: string;
}

/** Capability fallback is scoped to this mounted identity, never shared globally. */
export function createLiveAccessReader(
  client: TrevvApiClient,
  identity: AppIdentity,
  options: { timeoutMs?: number } = {},
) {
  let legacy = false;
  return async (signal?: AbortSignal): Promise<LiveAppAccessSnapshot> => {
    const controller = new AbortController();
    const abort = () => controller.abort(signal?.reason);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(
      () =>
        controller.abort(
          new DOMException("Access refresh timed out", "TimeoutError"),
        ),
      options.timeoutMs ?? 4_500,
    );
    const reader = client.withSignal(controller.signal);
    try {
      let status: AppSyncStatus | undefined;
      if (!legacy) {
        try {
          status = await reader.syncStatus();
        } catch (error) {
          if (
            !(error instanceof TrevvApiError) ||
            ![404, 405, 501].includes(error.status)
          )
            throw error;
          legacy = true;
        }
      }
      if (!status) {
        const [session, portfolios, workspaces] = await Promise.all([
          reader.session(),
          reader.portfolios(),
          reader.workspaces(),
        ]);
        status = {
          protocol: 1,
          revision: null,
          session,
          portfolios,
          workspaces,
        };
      }
      if (
        status.session.user.id !== identity.userId ||
        status.session.organization.id !== identity.organizationId
      ) {
        throw new TrevvApiError(
          "identity_changed",
          "The active account changed. Reload to continue.",
          "unknown",
          401,
        );
      }
      return { ...status, checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  };
}

export function accessScopeKey(access: LiveAppAccessSnapshot): string {
  return JSON.stringify([
    access.session.user.id,
    access.session.user.role,
    access.session.organization.id,
    access.session.organization.role,
    access.session.platformRole ?? null,
    [...access.session.managedWorkspaceIds].sort(),
    access.portfolios.map(({ id }) => id).sort(),
    access.workspaces.map(({ id }) => id).sort(),
  ]);
}

/** Existing cached data remains authorized only when identities/roles stay fixed and scope does not shrink. */
export function retainsAccessScope(
  before: LiveAppAccessSnapshot,
  after: LiveAppAccessSnapshot,
): boolean {
  const containsAll = (previous: string[], current: string[]) => {
    const allowed = new Set(current);
    return previous.every((id) => allowed.has(id));
  };
  return (
    before.session.user.id === after.session.user.id &&
    before.session.user.role === after.session.user.role &&
    before.session.organization.id === after.session.organization.id &&
    before.session.organization.role === after.session.organization.role &&
    (before.session.platformRole ?? null) ===
      (after.session.platformRole ?? null) &&
    containsAll(
      before.session.managedWorkspaceIds,
      after.session.managedWorkspaceIds,
    ) &&
    containsAll(
      before.portfolios.map(({ id }) => id),
      after.portfolios.map(({ id }) => id),
    ) &&
    containsAll(
      before.workspaces.map(({ id }) => id),
      after.workspaces.map(({ id }) => id),
    )
  );
}

/** A slow record refresh must never delay an authoritative permission reduction. */
export function restrictSnapshotToAccess(
  snapshot: LiveAppDataSnapshot,
  access: LiveAppAccessSnapshot,
): LiveAppDataSnapshot {
  const workspaces = new Set(access.workspaces.map(({ id }) => id));
  const portfolios = new Set(access.portfolios.map(({ id }) => id));
  const retain = <T>(values: T[], allowed: (value: T) => boolean): T[] =>
    values.every(allowed) ? values : values.filter(allowed);
  return {
    ...snapshot,
    portfolios: access.portfolios,
    workspaces: access.workspaces,
    items: retain(snapshot.items, (item) => workspaces.has(item.workspaceId)),
    waiting: retain(snapshot.waiting, (item) =>
      workspaces.has(item.workspaceId),
    ),
    attention: retain(
      snapshot.attention,
      (item) =>
        portfolios.has(item.portfolioId) &&
        (!item.workspaceId || workspaces.has(item.workspaceId)),
    ),
  };
}

/** Publish a complete snapshot only if its authorization/data revision stayed stable. */
export async function readVerifiedSnapshot(
  readAccess: () => Promise<LiveAppAccessSnapshot>,
  readSnapshot: (access: LiveAppAccessSnapshot) => Promise<LiveAppDataSnapshot>,
  previous?: LiveAppDataSnapshot,
): Promise<{ snapshot: LiveAppDataSnapshot; access: LiveAppAccessSnapshot }> {
  let before = await readAccess();
  if (
    before.revision &&
    previous?.revision === before.revision &&
    previous.complete !== false
  ) {
    return {
      snapshot: {
        ...restrictSnapshotToAccess(previous, before),
        refreshedAt: before.checkedAt,
      },
      access: before,
    };
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await readSnapshot(before);
    // Old APIs retain their complete-data polling behavior.
    if (!before.revision)
      return {
        snapshot: restrictSnapshotToAccess(snapshot, before),
        access: before,
      };
    const after = await readAccess();
    if (after.revision === before.revision) {
      return {
        snapshot: {
          ...restrictSnapshotToAccess(snapshot, after),
          revision: after.revision,
          refreshedAt: after.checkedAt,
        },
        access: after,
      };
    }
    before = after;
  }
  throw new Error(
    "Your workspace changed while loading. The last confirmed data remains visible; try again.",
  );
}
