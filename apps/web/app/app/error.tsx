"use client";

import { useEffect } from "react";
import { RouteFailureState } from "@/components/live-state";
import { reportClientError } from "@/lib/client-error-reporting";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError("app-route", error);
  }, [error]);

  return (
    <RouteFailureState
      title="This workspace could not be loaded"
      description="Your last confirmed data has not been replaced. Check the connection and try again."
      {...(error.digest ? { requestId: error.digest } : {})}
      onRetry={retry}
    />
  );
}
