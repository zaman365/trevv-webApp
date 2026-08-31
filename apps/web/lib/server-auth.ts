import "server-only";

import { createApiClient, TrevvApiError } from "@founderhq/api-client";
import { apiErrorSchema, sessionSchema } from "@founderhq/api-contract";
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
import { webRequestId } from "./security-headers";

type ApiClient = ReturnType<typeof createApiClient>;
export type WebAppSession = Awaited<ReturnType<ApiClient["session"]>>;

type SessionFlow =
  | "onboarding_required"
  | "invitation_acceptance_required"
  | "organization_selection_required"
  | "verification_required"
  | "access_unavailable";

type SessionResolution =
  | { flow: "active"; session: WebAppSession }
  | { flow: "anonymous" | SessionFlow };

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
    timezone: "Europe/Berlin",
  },
  availableOrganizations: [
    {
      id: "org-demo",
      name: "Fictional TREVV Demo",
      slug: "trevv-demo",
      role: "owner" as const,
    },
  ],
  managedWorkspaceIds: demoWorkspaces.map((workspace) => workspace.id),
  expiresAt: "2099-01-01T00:00:00.000Z",
} satisfies WebAppSession;

const resolveAppSession = cache(async (): Promise<SessionResolution> => {
  if (webRuntimeMode() === "demo")
    return { flow: "active", session: fictionalDemoSession };
  const response = await serverApiFetch("/session");
  const body: unknown = await response.json().catch(() => null);
  if (response.ok)
    return { flow: "active", session: sessionSchema.parse(body) };

  const parsed = apiErrorSchema.safeParse(body);
  const code = parsed.success ? parsed.data.error.code : undefined;
  if (response.status === 401) return { flow: "anonymous" };
  if (code === "onboarding_required" || response.status === 404)
    return { flow: "onboarding_required" };
  if (code === "invitation_acceptance_required")
    return { flow: "invitation_acceptance_required" };
  if (code === "organization_selection_required")
    return { flow: "organization_selection_required" };
  if (code === "identity_verification_required")
    return { flow: "verification_required" };
  if (code === "identity_access_unavailable")
    return { flow: "access_unavailable" };
  throw new Error(
    `Application session resolution failed (${response.status}).`,
  );
});

export async function requireAppSession(
  returnTo = "/app/portfolio",
): Promise<WebAppSession> {
  const resolution = await resolveAppSession();
  if (resolution.flow === "active") return resolution.session;
  if (resolution.flow === "onboarding_required") redirect("/onboarding");
  if (resolution.flow === "invitation_acceptance_required")
    redirect("/invite/accept?resume=1");
  if (resolution.flow === "organization_selection_required") {
    const target = new URLSearchParams({ next: returnTo });
    redirect(`/select-organization?${target}`);
  }
  if (resolution.flow === "verification_required") redirect("/verify-email");
  if (resolution.flow === "access_unavailable") notFound();
  if (resolution.flow === "anonymous") {
    const target = new URLSearchParams({ next: returnTo });
    redirect(`/sign-in?${target}`);
  }
  throw new Error("Application session flow was not handled.");
}

/**
 * Allow only a verified identity whose authoritative application flow is
 * onboarding. Pending invitation claims must recover through acceptance first.
 */
export async function requireOnboardingAccess(): Promise<void> {
  const resolution = await resolveAppSession();
  if (resolution.flow === "onboarding_required") return;
  if (resolution.flow === "invitation_acceptance_required")
    redirect("/invite/accept?resume=1");
  if (resolution.flow === "organization_selection_required")
    redirect("/select-organization?next=%2Fapp%2Fportfolio");
  if (resolution.flow === "verification_required") redirect("/verify-email");
  if (resolution.flow === "access_unavailable") notFound();
  if (resolution.flow === "anonymous") redirect("/sign-in?next=%2Fonboarding");
  if (resolution.flow === "active") redirect("/app/portfolio");
  throw new Error("Onboarding session flow was not handled.");
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
    const apiError = apiErrorDetails(error);
    if (apiError) {
      if (apiError.status === 401)
        redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
      if (apiError.status === 403 || apiError.status === 404) notFound();
    }
    throw error;
  }
}

function apiErrorDetails(
  error: unknown,
): { code: string; status: number } | null {
  if (error instanceof TrevvApiError)
    return { code: error.code, status: error.status };
  if (!error || typeof error !== "object") return null;
  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
  };
  return candidate.name === "TrevvApiError" &&
    typeof candidate.code === "string" &&
    typeof candidate.status === "number"
    ? { code: candidate.code, status: candidate.status }
    : null;
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
  forwardOperationalHeaders(requestHeaders, outgoing);
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
  forwardOperationalHeaders(requestHeaders, outgoing);
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
      forwardOperationalHeaders(forwarded, outgoing);
      return fetch(input, {
        ...init,
        headers: outgoing,
        cache: "no-store",
      });
    },
  });
}

export async function forwardedRequestHeaders(): Promise<Headers> {
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
  result.set("x-request-id", webRequestId(requestHeaders.get("x-request-id")));
  const trustedClientIpHeader =
    process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (trustedClientIpHeader) {
    const trustedClientIp = requestHeaders.get(trustedClientIpHeader);
    if (trustedClientIp) result.set(trustedClientIpHeader, trustedClientIp);
  }
  return result;
}

function forwardOperationalHeaders(source: Headers, destination: Headers) {
  destination.set("x-request-id", webRequestId(source.get("x-request-id")));
  const trustedClientIpHeader =
    process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  if (!trustedClientIpHeader) return;
  const trustedClientIp = source.get(trustedClientIpHeader);
  if (trustedClientIp) destination.set(trustedClientIpHeader, trustedClientIp);
}
