"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useReportWebVitals } from "next/web-vitals";
import {
  normalizedWebVitalSurface,
  shouldSampleWebVitals,
  type WebVitalReport,
} from "@/lib/web-vitals";
import {
  navigationMetricEvent,
  recordNavigationIntent,
  reportNavigationPaint,
} from "@/lib/navigation-performance";

type NextWebVital = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

export function WebVitalsReporter({
  enabled = false,
  sampleRate = 0.1,
}: {
  enabled?: boolean;
  sampleRate?: number;
}) {
  const [sampled] = useState(() =>
    shouldSampleWebVitals(enabled, sampleRate, Math.random()),
  );
  const pathname = usePathname();
  const report = useCallback(
    (metric: NextWebVital) => {
      if (sampled) reportWebVital(metric);
    },
    [sampled],
  );
  useReportWebVitals(report);

  useEffect(() => {
    if (pathname) reportNavigationPaint("ROUTE_COMMIT", pathname);
  }, [pathname]);
  useEffect(() => {
    const click = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const anchor =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (
        anchor &&
        !anchor.download &&
        (!anchor.target || anchor.target === "_self")
      )
        recordNavigationIntent(anchor.href);
    };
    const observed = (event: Event) => {
      if (!sampled || !(event instanceof CustomEvent)) return;
      const { name, value } = event.detail ?? {};
      if (
        (name !== "ROUTE_COMMIT" && name !== "ROUTE_READY") ||
        typeof value !== "number" ||
        !Number.isFinite(value)
      )
        return;
      reportWebVital({
        name,
        value,
        delta: value,
        rating:
          value <= 500 ? "good" : value <= 1000 ? "needs-improvement" : "poor",
        navigationType: "soft-navigate",
      });
    };
    document.addEventListener("click", click, true);
    window.addEventListener(navigationMetricEvent, observed);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener(navigationMetricEvent, observed);
    };
  }, [sampled]);
  return null;
}

function reportWebVital(
  metric: Pick<
    WebVitalReport,
    "name" | "value" | "delta" | "rating" | "navigationType"
  >,
) {
  const body = JSON.stringify({
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    surface: normalizedWebVitalSurface(window.location.pathname),
    device: window.matchMedia("(max-width: 767px)").matches
      ? "mobile"
      : "desktop",
  });
  void fetch("/api/web/vitals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}
