"use client";

import { useEffect } from "react";
import { RouteFailureState } from "@/components/live-state";
import { reportClientError } from "@/lib/client-error-reporting";

/**
 * Catch failures raised above a segment's own boundary — most importantly
 * `app/app/layout.tsx`, whose session and live-data resolution runs before any
 * page renders. Without this boundary those failures escape to
 * `global-error.tsx`, which replaces the whole document with an unstyled shell
 * and cannot offer a useful recovery path.
 */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("root-boundary", error);
  }, [error]);

  return (
    <RouteFailureState
      title="TREVV could not be loaded"
      description="The service may still be starting up, and nothing you had saved was changed. Try again in a moment."
      {...(error.digest ? { requestId: error.digest } : {})}
      onRetry={retry}
    />
  );
}
