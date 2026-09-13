"use client";
import { useEffect, useState } from "react";
import { useAppSession } from "./app-session-context";
import { liveDraftStorageKey } from "./live-workflow-ui";

export function useIssueDraft<T extends Record<string, string>>(
  scope: string,
  initial: T,
) {
  const session = useAppSession();
  const storageKey = liveDraftStorageKey({
    organizationId: session.organization.id,
    userId: session.user.id,
    scope,
  });
  const [draft, setDraft] = useState(initial);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const value: unknown = JSON.parse(
          localStorage.getItem(storageKey) ?? "null",
        );
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const fields = Object.entries(value).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && entry[1].length <= 30_000,
          );
          setDraft((current) => ({
            ...current,
            ...Object.fromEntries(fields.filter(([key]) => key in current)),
          }));
        }
      } catch {
        /* Keep the working draft available without storage. */
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(draft));
    } catch {
      /* In-memory editing remains available. */
    }
  }, [draft, hydrated, storageKey]);
  return { draft, setDraft, hydrated };
}
