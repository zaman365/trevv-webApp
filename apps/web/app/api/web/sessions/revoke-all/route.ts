import { serverAuthFetch } from "@/lib/server-auth";
import { appendSetCookieHeaders } from "@/lib/response-cookies";
import { hasSameOrigin } from "@/lib/session-route";
import { workspaceSelectionCookie } from "@/lib/workspace-selection";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const revoked = await serverAuthFetch("/revoke-sessions", { method: "POST" });
  if (!revoked.ok)
    return Response.json(
      { error: "Sessions could not be revoked." },
      { status: revoked.status },
    );
  const signedOut = await serverAuthFetch("/sign-out", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const responseHeaders = new Headers({
    "cache-control": "private, no-store",
  });
  appendSetCookieHeaders(signedOut.headers, responseHeaders);
  const response = NextResponse.json(
    { success: true },
    { headers: responseHeaders },
  );
  response.cookies.set(workspaceSelectionCookie, "", { maxAge: 0, path: "/" });
  return response;
}
