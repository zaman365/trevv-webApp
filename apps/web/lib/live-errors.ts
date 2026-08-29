import { TrevvApiError } from "@founderhq/api-client";
import type { LiveStateKind } from "@/components/live-state";

export interface LiveErrorPresentation {
  kind: Extract<
    LiveStateKind,
    | "offline"
    | "permission-loss"
    | "validation"
    | "rate-limit"
    | "version-conflict"
    | "terminal-error"
  >;
  title: string;
  description: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export function presentLiveError(error: unknown): LiveErrorPresentation {
  if (error instanceof TrevvApiError) {
    const common = {
      description: error.message,
      requestId: error.requestId,
    };
    if (error.status === 401 || error.status === 403 || error.status === 404) {
      return {
        ...common,
        kind: "permission-loss",
        title: "This record is no longer available",
      };
    }
    if (error.status === 409) {
      return {
        ...common,
        kind: "version-conflict",
        title: "A newer version is already saved",
      };
    }
    if (error.status === 422 || error.status === 400) {
      return {
        ...common,
        kind: "validation",
        title: "Check the highlighted information",
      };
    }
    if (error.status === 429) {
      const raw = error.details?.retryAfterSeconds;
      return {
        ...common,
        kind: "rate-limit",
        title: "TREVV needs a short pause",
        ...(typeof raw === "number" && Number.isFinite(raw)
          ? { retryAfterSeconds: Math.max(0, raw) }
          : {}),
      };
    }
    return {
      ...common,
      kind: "terminal-error",
      title: "The server did not confirm this operation",
    };
  }

  if (isOfflineError(error)) {
    return {
      kind: "offline",
      title: "You appear to be offline",
      description:
        "The draft is still available, but no business change has been saved.",
    };
  }

  return {
    kind: "terminal-error",
    title: "The operation was not confirmed",
    description:
      "Your draft is still available. Retry when the service is reachable.",
  };
}

function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return true;
  return (
    error instanceof TypeError &&
    /fetch|network|load failed|offline/i.test(error.message)
  );
}
