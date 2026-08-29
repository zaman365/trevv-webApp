"use client";

import { useEffect } from "react";
import { RouteFailureState } from "@/components/live-state";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("TREVV app route failed", {
      digest: error.digest,
      message: error.message,
    });
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
