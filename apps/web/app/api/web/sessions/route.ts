import { serverAuthFetch } from "@/lib/server-auth";
import { redactSessions } from "@/lib/session-route";

export const dynamic = "force-dynamic";

export async function GET() {
  const [sessionsResponse, currentResponse] = await Promise.all([
    serverAuthFetch("/list-sessions"),
    serverAuthFetch("/get-session"),
  ]);
  if (!sessionsResponse.ok || !currentResponse.ok) {
    return Response.json(
      { error: "Your session is no longer active. Sign in again." },
      {
        status:
          sessionsResponse.status === 401 || currentResponse.status === 401
            ? 401
            : 502,
        headers: { "cache-control": "private, no-store" },
      },
    );
  }
  const [sessions, current] = await Promise.all([
    sessionsResponse.json() as Promise<unknown>,
    currentResponse.json() as Promise<unknown>,
  ]);
  const currentId =
    current &&
    typeof current === "object" &&
    "session" in current &&
    typeof (current as { session?: { id?: unknown } }).session?.id === "string"
      ? (current as { session: { id: string } }).session.id
      : null;
  if (!currentId)
    return Response.json(
      { error: "Your session is no longer active. Sign in again." },
      {
        status: 401,
        headers: { "cache-control": "private, no-store" },
      },
    );
  const redacted = redactSessions(sessions, currentId);
  if (!redacted)
    return Response.json(
      { error: "The session service returned an invalid response." },
      { status: 502, headers: { "cache-control": "private, no-store" } },
    );
  return Response.json(redacted, {
    headers: { "cache-control": "private, no-store", pragma: "no-cache" },
  });
}
