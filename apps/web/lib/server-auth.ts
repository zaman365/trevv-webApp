import "server-only";

import { createApiClient, TrevvApiError } from "@founderhq/api-client";
import { demoWorkspaces } from "@founderhq/core";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import {
  demoWorkspaceRegistryCookie,
  parseDemoWorkspaceRegistry,
} from "./demo-workspace-registry";
import {
  webApiOrigin,
  webCanonicalUrl,
  webRuntimeMode,
} from "./web-runtime-config";

type ApiClient = ReturnType<typeof createApiClient>;
export type WebAppSession = Awaited<ReturnType<ApiClient["session"]>>;

class SessionFlowRequired extends Error {
  constructor(
    readonly flow:
      | "onboarding_required"
      | "organization_selection_required"
      | "verification_required"
      | "access_unavailable",
  ) {
    super(flow);
  }
}

const fictionalDemoSession = {
  user: {
    id: "demo-user",
    email: "founder@example.invalid",
    name: "Fictional Founder",
    role: "owner" as const,
    locale: "en" as const,
  },
  organizationId: "org-demo",
  organization: {
    id: "org-demo",
    name: "Fictional TREVV Demo",
    slug: "trevv-demo",
    role: "owner" as const,
  },
  availableOrganizations: [
    {
      id: "org-demo",
      name: "Fictional TREVV Demo",
      slug: "trevv-demo",
      role: "owner" as const,
    },
  ],
  expiresAt: "2099-01-01T00:00:00.000Z",
} satisfies WebAppSession;

export const resolveAppSession = cache(
  async (): Promise<WebAppSession | null> => {
    if (webRuntimeMode() === "demo") return fictionalDemoSession;
    try {
      return (await serverApiClient()).session();
    } catch (error) {
      if (error instanceof TrevvApiError) {
        if (error.status === 401) return null;
        if (error.code === "onboarding_required" || error.status === 404)
          throw new SessionFlowRequired("onboarding_required");
        if (error.code === "organization_selection_required")
          throw new SessionFlowRequired("organization_selection_required");
        if (error.code === "identity_verification_required")
          throw new SessionFlowRequired("verification_required");
        if (error.code === "identity_access_unavailable")
          throw new SessionFlowRequired("access_unavailable");
      }
      throw error;
    }
  },
);

export async function requireAppSession(
  returnTo = "/app/portfolio",
): Promise<WebAppSession> {
  let session: WebAppSession | null;
  try {
    session = await resolveAppSession();
  } catch (error) {
    if (error instanceof SessionFlowRequired) {
      if (error.flow === "onboarding_required") redirect("/onboarding");
      if (error.flow === "organization_selection_required") {
        const target = new URLSearchParams({ next: returnTo });
        redirect(`/select-organization?${target}`);
      }
      if (error.flow === "verification_required") redirect("/verify-email");
      if (error.flow === "access_unavailable") notFound();
    }
    throw error;
  }
  if (!session) {
    const target = new URLSearchParams({ next: returnTo });
    redirect(`/sign-in?${target}`);
  }
  return session;
}

export async function requireWorkspaceAccess(
  workspaceSlug: string,
  returnTo: string,
) {
  await requireAppSession(returnTo);
  if (webRuntimeMode() === "demo") {
    const workspace = demoWorkspaces.find(
      (candidate) => candidate.slug === workspaceSlug,
    );
    if (workspace) return { workspace, rollup: null, items: [] };
    const cookieStore = await cookies();
    const registered = parseDemoWorkspaceRegistry(
      cookieStore.get(demoWorkspaceRegistryCookie)?.value,
    );
    if (!registered.includes(workspaceSlug)) notFound();
    return { workspace: null, rollup: null, items: [] };
  }
  try {
    return await (await serverApiClient()).workspace(workspaceSlug);
  } catch (error) {
    if (error instanceof TrevvApiError) {
      if (error.status === 401)
        redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      if (error.status === 403 || error.status === 404) notFound();
    }
    throw error;
  }
}

export async function hasAuthenticationIdentity(): Promise<boolean> {
  if (webRuntimeMode() === "demo") return false;
  const response = await serverAuthFetch("/get-session");
  if (response.status === 401 || response.status === 404) return false;
  if (!response.ok)
    throw new Error("Authentication session resolution failed.");
  const body: unknown = await response.json();
  return Boolean(
    body &&
    typeof body === "object" &&
    "user" in body &&
    (body as { user?: { id?: unknown; emailVerified?: unknown } }).user?.id &&
    (body as { user: { emailVerified?: unknown } }).user.emailVerified === true,
  );
}

export async function requireAuthenticationIdentity(
  returnTo?: string,
): Promise<void> {
  if (!(await hasAuthenticationIdentity())) {
    const target = returnTo
      ? `?${new URLSearchParams({ next: returnTo })}`
      : "";
    redirect(`/sign-in${target}`);
  }
}

export async function serverAuthFetch(
  path: `/${string}`,
  init: RequestInit = {},
): Promise<Response> {
  const requestHeaders = await forwardedRequestHeaders();
  const outgoing = new Headers(init.headers);
  const cookie = requestHeaders.get("cookie");
  if (cookie) outgoing.set("cookie", cookie);
  const origin = requestHeaders.get("origin");
  if (origin) outgoing.set("origin", origin);
  if (init.body && !outgoing.has("content-type"))
    outgoing.set("content-type", "application/json");
  return fetch(new URL(`/api/auth${path}`, webApiOrigin()), {
    ...init,
    headers: outgoing,
    cache: "no-store",
  });
}

export async function serverApiFetch(
  path: `/${string}`,
  init: RequestInit = {},
): Promise<Response> {
  const requestHeaders = await forwardedRequestHeaders();
  const outgoing = new Headers(init.headers);
  const cookie = requestHeaders.get("cookie");
  if (cookie) outgoing.set("cookie", cookie);
  const origin = requestHeaders.get("origin");
  if (origin) outgoing.set("origin", origin);
  if (init.body && !outgoing.has("content-type"))
    outgoing.set("content-type", "application/json");
  return fetch(new URL(`/api/v1${path}`, webApiOrigin()), {
    ...init,
    headers: outgoing,
    cache: "no-store",
  });
}

async function serverApiClient() {
  const forwarded = await forwardedRequestHeaders();
  return createApiClient({
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
  const fetchSite = requestHeaders.get("sec-fetch-site");
  if (fetchSite) result.set("sec-fetch-site", fetchSite);
  const userAgent = requestHeaders.get("user-agent");
  if (userAgent) result.set("user-agent", userAgent);
  return result;
}
