import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  authActionCookieOptions,
  authActionCookiePaths,
  authActionCookies,
} from "@/lib/auth-action-cookies";
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
  if (!token) return unavailable(404);

  let upstream: Response;
  try {
    upstream = await serverApiFetch("/invitations/accept", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  } catch {
    return temporarilyUnavailable();
  }
  if (!upstream.ok) {
    if (upstream.status === 429 || upstream.status >= 500)
      return temporarilyUnavailable();
    const response = unavailable(upstream.status === 401 ? 401 : 404);
    if (upstream.status !== 401) clearInvitationCookie(response, request);
    return response;
  }
  const body: unknown = await upstream.json().catch(() => null);
  if (
    !body ||
    typeof body !== "object" ||
    typeof (body as { organizationId?: unknown }).organizationId !== "string"
  ) {
    return temporarilyUnavailable();
  }
  const response = NextResponse.json({ accepted: true });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  clearInvitationCookie(response, request);
  return response;
}

function temporarilyUnavailable() {
  const response = NextResponse.json(
    { error: "The invitation service is temporarily unavailable. Try again." },
    { status: 503 },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
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
