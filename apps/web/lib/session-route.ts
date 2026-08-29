import { webCanonicalUrl } from "./web-runtime-config";

export interface RedactedSession {
  id: string;
  current: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
}

interface AuthSessionRecord {
  id?: unknown;
  token?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  expiresAt?: unknown;
  ipAddress?: unknown;
  userAgent?: unknown;
}

export function redactSessions(
  value: unknown,
  currentSessionId: string | null,
): RedactedSession[] | null {
  if (!Array.isArray(value)) return null;
  const result: RedactedSession[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const session = entry as AuthSessionRecord;
    if (
      typeof session.id !== "string" ||
      typeof session.token !== "string" ||
      !isDateValue(session.createdAt) ||
      !isDateValue(session.updatedAt) ||
      !isDateValue(session.expiresAt)
    )
      return null;
    result.push({
      id: session.id,
      current: session.id === currentSessionId,
      createdAt: toIso(session.createdAt),
      updatedAt: toIso(session.updatedAt),
      expiresAt: toIso(session.expiresAt),
      ipAddress:
        typeof session.ipAddress === "string" ? session.ipAddress : null,
      userAgent:
        typeof session.userAgent === "string" ? session.userAgent : null,
    });
  }
  return result.sort((left, right) =>
    left.current === right.current ? 0 : left.current ? -1 : 1,
  );
}

export function sessionTokenForId(value: unknown, id: string): string | null {
  if (!Array.isArray(value)) return null;
  const session = value.find((entry): entry is AuthSessionRecord =>
    Boolean(
      entry &&
      typeof entry === "object" &&
      (entry as AuthSessionRecord).id === id,
    ),
  );
  return typeof session?.token === "string" ? session.token : null;
}

export function hasSameOrigin(
  request: Request,
  expectedOrigin = webCanonicalUrl().origin,
): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).origin === new URL(expectedOrigin).origin;
    } catch {
      return false;
    }
  }
  return request.headers.get("sec-fetch-site") === "same-origin";
}

function isDateValue(value: unknown): value is string | Date {
  return (
    (typeof value === "string" || value instanceof Date) &&
    !Number.isNaN(new Date(value).valueOf())
  );
}

function toIso(value: string | Date): string {
  return new Date(value).toISOString();
}
