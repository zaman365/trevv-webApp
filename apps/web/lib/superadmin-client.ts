"use client";

import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";

export const superadminAuthClient = createAuthClient({
  basePath: "/api/superadmin/auth",
  plugins: [passkeyClient()],
});

export async function superadminRequest<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api/superadmin${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    ...(signal ? { signal } : {}),
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const value = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/"))
      window.location.replace("/superadmin/sign-in");
    throw new Error(
      typeof value.message === "string"
        ? value.message
        : "The request could not be completed. Try again.",
    );
  }
  return value as T;
}
