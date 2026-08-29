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

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const token = (await cookies()).get(authActionCookies.passwordReset)?.value;
  const raw: unknown = await request.json().catch(() => null);
  const newPassword =
    raw &&
    typeof raw === "object" &&
    typeof (raw as { newPassword?: unknown }).newPassword === "string"
      ? (raw as { newPassword: string }).newPassword
      : "";
  if (!token || newPassword.length < 12 || newPassword.length > 128)
    return resetError(400);

  const upstream = await serverAuthFetch("/reset-password", {
    method: "POST",
    body: JSON.stringify({ newPassword, token }),
  });
  const response = upstream.ok
    ? NextResponse.json({ success: true })
    : resetError(upstream.status >= 500 ? 502 : 400);
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  appendSetCookieHeaders(upstream.headers, response.headers);
  if (upstream.ok || upstream.status < 500) clearResetCookie(response, request);
  return response;
}

function resetError(status: number) {
  const response = NextResponse.json(
    {
      error:
        status === 400
          ? "This reset link is invalid, expired, or has already been used."
          : "The password could not be reset. Try again.",
    },
    { status },
  );
  response.headers.set("cache-control", "private, no-store, max-age=0");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}

function clearResetCookie(response: NextResponse, request: Request) {
  response.cookies.set(authActionCookies.passwordReset, "", {
    ...authActionCookieOptions(
      authActionCookiePaths.passwordReset,
      process.env.NODE_ENV === "production" ||
        new URL(request.url).protocol === "https:",
    ),
    maxAge: 0,
  });
}
