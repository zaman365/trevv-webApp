import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  authActionCookieOptions,
  authActionCookiePaths,
  authActionCookies,
} from "@/lib/auth-action-cookies";
import { invitationAcceptanceUpstream } from "@/lib/invitation-recovery";
import { serverApiFetch } from "@/lib/server-auth";
import { hasSameOrigin } from "@/lib/session-route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const token = (await cookies()).get(authActionCookies.invitation)?.value;
  let acceptance = invitationAcceptanceUpstream(token);
  let claimRecovery = acceptance.path === "/invitations/accept-claim";

  if (claimRecovery) {
    const precondition = await pendingClaimPrecondition(request, true);
    if (precondition !== true) return precondition;
  }

  while (true) {
    let upstream: Response;
    try {
      upstream = await serverApiFetch(acceptance.path, acceptance.init);
    } catch {
      if (claimRecovery && (await claimedAcceptanceWasCommitted()))
        return acceptedResponse(request);
      return temporarilyUnavailable();
    }
    if (!upstream.ok) {
      if (!claimRecovery && upstream.status === 404) {
        const precondition = await pendingClaimPrecondition(request, false);
        if (precondition === true) {
          acceptance = invitationAcceptanceUpstream(undefined);
          claimRecovery = true;
          continue;
        }
        if (precondition.status === 429 || precondition.status >= 500)
          return precondition;
      }
      if (claimRecovery && (await claimedAcceptanceWasCommitted()))
        return acceptedResponse(request);
      if (upstream.status === 429 || upstream.status >= 500)
        return temporarilyUnavailable(
          upstream.status === 429 ? 429 : 503,
          upstream.headers,
        );
      const response = unavailable(upstream.status === 401 ? 401 : 404);
      if (upstream.status !== 401) clearInvitationCookie(response, request);
      return response;
    }
    const body: unknown = await upstream.json().catch(() => null);
    if (!hasOrganization(body)) {
      if (claimRecovery && (await claimedAcceptanceWasCommitted()))
        return acceptedResponse(request);
      return temporarilyUnavailable();
    }
    return acceptedResponse(request);
  }
}

async function pendingClaimPrecondition(
  request: Request,
  reconcileCommittedAcceptance: boolean,
): Promise<true | NextResponse> {
  let response: Response;
  try {
    response = await serverApiFetch("/session");
  } catch {
    return temporarilyUnavailable();
  }
  const body: unknown = await response.json().catch(() => null);
  if (
    response.status === 409 &&
    apiErrorCode(body) === "invitation_acceptance_required"
  )
    return true;
  if (response.ok && hasOrganization(body) && reconcileCommittedAcceptance)
    return acceptedResponse(request);
  if (response.status === 401) return unavailable(401);
  if (response.status === 429 || response.status >= 500)
    return temporarilyUnavailable(
      response.status === 429 ? 429 : 503,
      response.headers,
    );
  return unavailable(404);
}

async function claimedAcceptanceWasCommitted(): Promise<boolean> {
  try {
    const response = await serverApiFetch("/session");
    if (!response.ok) return false;
    const body: unknown = await response.json().catch(() => null);
    return hasOrganization(body);
  } catch {
    return false;
  }
}

function hasOrganization(value: unknown): boolean {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { organizationId?: unknown }).organizationId === "string"
  );
}

function apiErrorCode(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function acceptedResponse(request: Request) {
  const response = NextResponse.json({ accepted: true });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  clearInvitationCookie(response, request);
  return response;
}

function temporarilyUnavailable(status = 503, upstreamHeaders?: Headers) {
  const response = NextResponse.json(
    {
      error:
        status === 429
          ? "Too many invitation attempts. Wait a moment, then try again."
          : "The invitation service is temporarily unavailable. Try again.",
    },
    { status },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  for (const name of ["retry-after", "x-request-id"] as const) {
    const value = upstreamHeaders?.get(name);
    if (value) response.headers.set(name, value);
  }
  return response;
}

function unavailable(status: number) {
  const response = NextResponse.json(
    {
      error:
        status === 401
          ? "Sign in with the invited email address to continue."
          : "This invitation is invalid, expired, revoked, or already used.",
    },
    { status },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function clearInvitationCookie(response: NextResponse, request: Request) {
  const secure =
    process.env.NODE_ENV === "production" ||
    new URL(request.url).protocol === "https:";
  for (const action of ["invitation", "invitationRegistration"] as const)
    response.cookies.set(authActionCookies[action], "", {
      ...authActionCookieOptions(authActionCookiePaths[action], secure),
      maxAge: 0,
    });
}
