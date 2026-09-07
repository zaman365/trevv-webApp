import "server-only";
import { readAllPages } from "./read-all-pages";

import { createApiClient } from "@founderhq/api-client";
import { createLiveAccessReader } from "./live-app-sync";
import type { WebAppSession } from "./server-auth";
import type { LiveAppDataSnapshot } from "./live-app-data";
import {
  forwardedRequestHeaders,
  loadAccessibleWorkspaces,
} from "./server-auth";
import { webApiOrigin } from "./web-runtime-config";

async function serverDataClient() {
  const forwarded = await forwardedRequestHeaders();
  return createApiClient({
    baseUrl: new URL("/api/v1", webApiOrigin()).toString(),
    fetchImpl: async (input, init) => {
      const outgoing = new Headers(init?.headers);
      const cookie = forwarded.get("cookie");
      if (cookie) outgoing.set("cookie", cookie);
      const origin = forwarded.get("origin");
      if (origin) outgoing.set("origin", origin);
      const requestId = forwarded.get("x-request-id");
      if (requestId) outgoing.set("x-request-id", requestId);
      const trustedClientIpHeader =
        process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
      const trustedClientIp = trustedClientIpHeader
        ? forwarded.get(trustedClientIpHeader)
        : null;
      if (trustedClientIpHeader && trustedClientIp)
        outgoing.set(trustedClientIpHeader, trustedClientIp);
      return fetch(input, {
        ...init,
        headers: outgoing,
        cache: "no-store",
      });
    },
  });
}

/** First entry needs authorized navigation, not every work item's history. */
export async function loadLiveAppAccess(session: WebAppSession) {
  return createLiveAccessReader(await serverDataClient(), {
    userId: session.user.id,
    organizationId: session.organization.id,
  })();
}

/** Complete snapshot compatibility for established server consumers. */
export async function loadLiveAppData(): Promise<LiveAppDataSnapshot> {
  const client = await serverDataClient();
  const [portfolios, workspaces, attention, waiting, items] = await Promise.all(
    [
      client.portfolios(),
      loadAccessibleWorkspaces(),
      client.attention(),
      client.waiting(),
      fetchEveryWorkItem(client),
    ],
  );
  return {
    portfolios,
    workspaces,
    attention,
    waiting,
    items,
    refreshedAt: new Date().toISOString(),
  };
}

async function fetchEveryWorkItem(client: ReturnType<typeof createApiClient>) {
  return readAllPages((cursor) =>
    client.items({ ...(cursor ? { cursor } : {}), limit: 100 }),
  );
}
