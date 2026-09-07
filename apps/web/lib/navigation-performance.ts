"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export const navigationMetricEvent = "trevv:navigation-metric";
type NavigationMetricName = "ROUTE_COMMIT" | "ROUTE_READY";
let pending:
  | { path: string; started: number; reported: Set<NavigationMetricName> }
  | undefined;

export function recordNavigationIntent(href: string) {
  if (typeof window === "undefined") return;
  const destination = new URL(href, window.location.href);
  if (
    destination.origin !== window.location.origin ||
    destination.pathname === window.location.pathname
  )
    return;
  pending = {
    path: destination.pathname,
    started: performance.now(),
    reported: new Set(),
  };
}

export function reportNavigationPaint(
  name: NavigationMetricName,
  pathname: string,
) {
  const current = pending;
  if (!current || current.path !== pathname || current.reported.has(name))
    return;
  current.reported.add(name);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      if (pending !== current || window.location.pathname !== pathname) return;
      const value = performance.now() - current.started;
      if (value > 120_000 || document.visibilityState === "hidden") return;
      // Route identity stays in this document. The reporter normalizes it before sending.
      window.dispatchEvent(
        new CustomEvent(navigationMetricEvent, { detail: { name, value } }),
      );
    }),
  );
}

/** Call only when the destination's actual required data and controls are ready. */
export function useReportRouteReady(ready: boolean) {
  const pathname = usePathname();
  useEffect(() => {
    if (ready && pathname) reportNavigationPaint("ROUTE_READY", pathname);
  }, [ready, pathname]);
}
