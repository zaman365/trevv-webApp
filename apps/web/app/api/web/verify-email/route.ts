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

const completedVerificationCookie = "trevv.completed_email_verification";
const completedVerificationMaxAgeSeconds = 60;

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const cookieStore = await cookies();
  const token = cookieStore.get(authActionCookies.emailVerification)?.value;
  if (
    !token &&
    cookieStore.get(completedVerificationCookie)?.value === "confirmed"
  )
    return verificationSuccess();
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
  const retryable = upstream.status === 429 || upstream.status >= 500;
  const response = successful
    ? verificationSuccess()
    : verificationError(
        upstream.status === 429 ? 429 : upstream.status >= 500 ? 502 : 400,
      );
  appendSetCookieHeaders(upstream.headers, response.headers);
  if (retryable) forwardRetryHeaders(upstream.headers, response.headers);
  if (successful || !retryable) clearVerificationCookie(response, request);
  if (successful) markVerificationCompleted(response, request);
  else if (!retryable) clearCompletedVerification(response, request);
  return response;
}

function verificationSuccess() {
  const response = NextResponse.json({ success: true });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function verificationError(status: number) {
  const response = NextResponse.json(
    {
      error:
        status === 400
          ? "This verification link is invalid, expired, or already used."
          : status === 429
            ? "Too many verification attempts. Wait a moment, then try verification again."
            : "Your email could not be verified, and no verification was confirmed. Try verification again.",
    },
    { status },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function forwardRetryHeaders(source: Headers, destination: Headers) {
  for (const name of ["retry-after", "x-request-id"] as const) {
    const value = source.get(name);
    if (value) destination.set(name, value);
  }
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

function markVerificationCompleted(response: NextResponse, request: Request) {
  response.cookies.set(completedVerificationCookie, "confirmed", {
    ...verificationCookieOptions(request),
    maxAge: completedVerificationMaxAgeSeconds,
  });
}

function clearCompletedVerification(response: NextResponse, request: Request) {
  response.cookies.set(completedVerificationCookie, "", {
    ...verificationCookieOptions(request),
    maxAge: 0,
  });
}

function verificationCookieOptions(request: Request) {
  return authActionCookieOptions(
    authActionCookiePaths.emailVerification,
    process.env.NODE_ENV === "production" ||
      new URL(request.url).protocol === "https:",
  );
}
