import { NextResponse } from "next/server";
import { appendSetCookieHeaders } from "@/lib/response-cookies";
import { serverAuthFetch } from "@/lib/server-auth";
import { hasSameOrigin } from "@/lib/session-route";
import { workspaceSelectionCookie } from "@/lib/workspace-selection";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const upstream = await serverAuthFetch("/sign-out", {
    method: "POST",
    body: JSON.stringify({}),
  });
  if (!upstream.ok)
    return NextResponse.json(
      { error: "This browser could not be signed out." },
      { status: upstream.status >= 500 ? 502 : upstream.status },
    );
  const response = NextResponse.json({ success: true });
  appendSetCookieHeaders(upstream.headers, response.headers);
  response.cookies.set(workspaceSelectionCookie, "", { maxAge: 0, path: "/" });
  response.headers.set("cache-control", "private, no-store, max-age=0");
  return response;
}
