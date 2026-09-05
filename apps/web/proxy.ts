import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clientNavigationHeader } from "./lib/navigation-request";
import {
  authActionCookieOptions,
  authActionCookiePaths,
  authActionCookies,
} from "./lib/auth-action-cookies";
import {
  safeReturnPath,
  webRuntimeMode,
  webSessionCookieNames,
} from "./lib/web-runtime-config";
import {
  webRequestId,
  webTelemetryPath,
  writeStructuredWebLog,
} from "./lib/security-headers";

export function proxy(request: NextRequest) {
  const requestId = webRequestId(request.headers.get("x-request-id"));
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.delete(clientNavigationHeader);
  // Vinext strips Flight headers before Proxy too, but retains its explicit
  // RSC Accept type. This only selects the seed strategy, never authorization.
  const acceptsRsc = request.headers
    .get("accept")
    ?.split(",")
    .some((value) => value.trim().split(";")[0] === "text/x-component");
  if (request.headers.get("rsc") === "1" || acceptsRsc)
    requestHeaders.set(clientNavigationHeader, "1");
  const nextResponse = () =>
    NextResponse.next({ request: { headers: requestHeaders } });
  const finish = (response: NextResponse) => {
    response.headers.set("x-request-id", requestId);
    return response;
  };
  if (process.env.NODE_ENV === "production")
    writeStructuredWebLog({
      level: "info",
      service: "trevv-web",
      event: "request_received",
      requestId,
      method: request.method,
      path: webTelemetryPath(request.nextUrl.pathname),
    });
  if (request.nextUrl.pathname === "/api/web/livez")
    return finish(nextResponse());
  if (webRuntimeMode() === "demo") return finish(nextResponse());
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
      if (tokenAction === "invitation") {
        // Registration and acceptance need the same opaque capability, but
        // neither cookie should accompany unrelated API requests.
        response.cookies.set(
          authActionCookies.invitationRegistration,
          token,
          authActionCookieOptions(
            authActionCookiePaths.invitationRegistration,
            process.env.NODE_ENV === "production" ||
              request.nextUrl.protocol === "https:",
          ),
        );
      }
    }
    return finish(response);
  }
  if (!request.nextUrl.pathname.startsWith("/app"))
    return finish(nextResponse());
  const hasSessionMarker = webSessionCookieNames().some((name) =>
    request.cookies.has(name),
  );
  if (hasSessionMarker) return finish(nextResponse());

  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set(
    "next",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  return finish(NextResponse.redirect(signIn));
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
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|og.png).*)",
  ],
};
