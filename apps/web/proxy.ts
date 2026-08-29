import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  authActionCookieOptions,
  authActionCookiePaths,
  authActionCookies,
} from "./lib/auth-action-cookies";
import { safeReturnPath, webRuntimeMode } from "./lib/web-runtime-config";

const sessionCookieNames = [
  "trevv.session_token",
  "__Secure-trevv.session_token",
] as const;

export function proxy(request: NextRequest) {
  if (webRuntimeMode() === "demo") return NextResponse.next();
  const tokenAction = tokenActionFor(request.nextUrl.pathname);
  const token = request.nextUrl.searchParams.get("token");
  if (tokenAction && token) {
    const requestedNext = request.nextUrl.searchParams.get("next");
    const cleanUrl = request.nextUrl.clone();
    cleanUrl.search = "";
    cleanUrl.searchParams.set("resume", "1");
    if (requestedNext)
      cleanUrl.searchParams.set("next", safeReturnPath(requestedNext));
    const response = NextResponse.redirect(cleanUrl, 303);
    response.headers.set("cache-control", "private, no-store, max-age=0");
    response.headers.set("referrer-policy", "no-referrer");
    if (token.length <= 2_048) {
      response.cookies.set(
        authActionCookies[tokenAction],
        token,
        authActionCookieOptions(
          authActionCookiePaths[tokenAction],
          process.env.NODE_ENV === "production" ||
            request.nextUrl.protocol === "https:",
        ),
      );
    }
    return response;
  }
  if (!request.nextUrl.pathname.startsWith("/app")) return NextResponse.next();
  const hasSessionMarker = sessionCookieNames.some((name) =>
    request.cookies.has(name),
  );
  if (hasSessionMarker) return NextResponse.next();

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return NextResponse.redirect(signIn);
}

function tokenActionFor(
  pathname: string,
): keyof typeof authActionCookies | null {
  if (pathname === "/invite/accept") return "invitation";
  if (pathname === "/reset-password") return "passwordReset";
  if (pathname === "/verify-email") return "emailVerification";
  return null;
}

export const config = {
  matcher: [
    "/app/:path*",
    "/invite/accept",
    "/reset-password",
    "/verify-email",
  ],
};
