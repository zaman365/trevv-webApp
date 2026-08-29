import "server-only";

import { createApiClient } from "@founderhq/api-client";
import { cookies, headers } from "next/headers";
import type { LiveAppDataSnapshot } from "./live-app-data";
import { webApiOrigin, webCanonicalUrl } from "./web-runtime-config";

export async function loadLiveAppData(): Promise<LiveAppDataSnapshot> {
  const forwarded = await forwardedRequestHeaders();
  const client = createApiClient({
    baseUrl: new URL("/api/v1", webApiOrigin()).toString(),
    fetchImpl: async (input, init) => {
      const outgoing = new Headers(init?.headers);
      const cookie = forwarded.get("cookie");
      if (cookie) outgoing.set("cookie", cookie);
      const origin = forwarded.get("origin");
      if (origin) outgoing.set("origin", origin);
      return fetch(input, {
        ...init,
        headers: outgoing,
        cache: "no-store",
      });
    },
  });
  const [portfolios, workspaces, attention, waiting, items] = await Promise.all(
    [
      client.portfolios(),
      client.workspaces(),
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
  const items: Awaited<ReturnType<typeof client.items>>["data"] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const response = await client.items({
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });
    items.push(...response.data);
    if (!response.nextCursor) return items;
    cursor = response.nextCursor;
  }
  throw new Error("The work-item pagination limit was exceeded.");
}

async function forwardedRequestHeaders(): Promise<Headers> {
  const [requestHeaders, cookieStore] = await Promise.all([
    headers(),
    cookies(),
  ]);
  const result = new Headers();
  const cookie = cookieStore.toString();
  if (cookie) result.set("cookie", cookie);
  const origin = requestHeaders.get("origin");
  if (origin) result.set("origin", origin);
  else if (requestHeaders.get("sec-fetch-site") === "same-origin")
    result.set("origin", webCanonicalUrl().origin);
  return result;
}
