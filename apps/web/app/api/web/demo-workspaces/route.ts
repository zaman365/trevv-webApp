import { NextResponse } from "next/server";
import {
  demoWorkspaceRegistryCookie,
  isDemoWorkspaceSlug,
  parseDemoWorkspaceRegistry,
  serializeDemoWorkspaceRegistry,
} from "@/lib/demo-workspace-registry";
import { hasSameOrigin } from "@/lib/session-route";
import { webRuntimeMode } from "@/lib/web-runtime-config";

export async function POST(request: Request) {
  if (webRuntimeMode() !== "demo") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!hasSameOrigin(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  const slug =
    body && typeof body === "object" && "slug" in body
      ? (body as { slug?: unknown }).slug
      : undefined;
  if (!isDemoWorkspaceSlug(slug)) {
    return NextResponse.json(
      { error: "A valid fictional workspace slug is required." },
      { status: 422 },
    );
  }

  const current = parseDemoWorkspaceRegistry(
    request.headers
      .get("cookie")
      ?.split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${demoWorkspaceRegistryCookie}=`))
      ?.slice(demoWorkspaceRegistryCookie.length + 1),
  );
  const response = NextResponse.json(
    { registered: true, persistence: "browser_demo_only" },
    { headers: { "cache-control": "private, no-store" } },
  );
  response.cookies.set(
    demoWorkspaceRegistryCookie,
    serializeDemoWorkspaceRegistry([slug, ...current]),
    {
      httpOnly: true,
      maxAge: 60 * 60 * 24,
      path: "/",
      sameSite: "lax",
      secure: new URL(request.url).protocol === "https:",
    },
  );
  return response;
}
