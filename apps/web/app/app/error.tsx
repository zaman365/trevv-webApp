"use client";

import { useEffect } from "react";
import { RouteFailureState } from "@/components/live-state";
import { reportClientError } from "@/lib/client-error-reporting";
import {
  routeErrorRecovery,
  type RouteErrorProps,
} from "@/lib/route-error-recovery";

export default function AppError({ error, retry, reset }: RouteErrorProps) {
  useEffect(() => {
    reportClientError("app-route", error);
  }, [error]);

  return (
    <RouteFailureState
      title="This workspace could not be loaded"
      description="Your last confirmed data has not been replaced. Check the connection and try again."
      {...(error.digest ? { requestId: error.digest } : {})}
      onRetry={routeErrorRecovery({ retry, reset, error })}
    />
  );
}
