import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  authActionCookieOptions,
  authActionCookiePaths,
  authActionCookies,
} from "@/lib/auth-action-cookies";
import { appendSetCookieHeaders } from "@/lib/response-cookies";
import { serverAuthFetch } from "@/lib/server-auth";
import { hasSameOrigin } from "@/lib/session-route";
import { safeReturnPath, webCanonicalUrl } from "@/lib/web-runtime-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const token = (await cookies()).get(
    authActionCookies.emailVerification,
  )?.value;
  if (!token) return verificationError(400);

  const raw: unknown = await request.json().catch(() => null);
  const requestedReturn =
    raw &&
    typeof raw === "object" &&
    typeof (raw as { returnTo?: unknown }).returnTo === "string"
      ? (raw as { returnTo: string }).returnTo
      : undefined;
  const callbackURL = new URL(
    safeReturnPath(requestedReturn ?? "/onboarding"),
    webCanonicalUrl(),
  ).toString();
  const query = new URLSearchParams({ token, callbackURL });
  const upstream = await serverAuthFetch(`/verify-email?${query}`, {
    method: "GET",
    redirect: "manual",
  });
  const location = upstream.headers.get("location");
  const redirectedWithError = location
    ? new URL(location, callbackURL).searchParams.has("error")
    : false;
  const successful =
    !redirectedWithError &&
    (upstream.ok || (upstream.status >= 300 && upstream.status < 400));
  const response = successful
    ? NextResponse.json({ success: true })
    : verificationError(upstream.status >= 500 ? 502 : 400);
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  appendSetCookieHeaders(upstream.headers, response.headers);
  if (successful || upstream.status < 500)
    clearVerificationCookie(response, request);
  return response;
}

function verificationError(status: number) {
  const response = NextResponse.json(
    {
      error:
        status === 400
          ? "This verification link is invalid, expired, or already used."
          : "Your email could not be verified. Try again.",
    },
    { status },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function clearVerificationCookie(response: NextResponse, request: Request) {
  response.cookies.set(authActionCookies.emailVerification, "", {
    ...authActionCookieOptions(
      authActionCookiePaths.emailVerification,
      process.env.NODE_ENV === "production" ||
        new URL(request.url).protocol === "https:",
    ),
    maxAge: 0,
  });
}
