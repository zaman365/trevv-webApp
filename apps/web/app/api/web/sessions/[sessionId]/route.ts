import { serverAuthFetch } from "@/lib/server-auth";
import { hasSameOrigin, sessionTokenForId } from "@/lib/session-route";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!hasSameOrigin(request))
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const { sessionId } = await params;
  const list = await serverAuthFetch("/list-sessions");
  if (!list.ok)
    return Response.json(
      { error: "Your session is no longer active. Sign in again." },
      { status: list.status === 401 ? 401 : 502 },
    );
  const token = sessionTokenForId(await list.json(), sessionId);
  if (!token)
    return Response.json({ error: "Session not found." }, { status: 404 });
  const revoked = await serverAuthFetch("/revoke-session", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  if (!revoked.ok)
    return Response.json(
      { error: "The session could not be revoked." },
      { status: revoked.status },
    );
  return Response.json(
    { success: true },
    { headers: { "cache-control": "private, no-store" } },
  );
}
