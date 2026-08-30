"use client";

import { useReportWebVitals } from "next/web-vitals";
import {
  normalizedWebVitalSurface,
  parseRumSampleRate,
  shouldSampleWebVitals,
} from "@/lib/web-vitals";

type NextWebVital = Parameters<Parameters<typeof useReportWebVitals>[0]>[0];

export function WebVitalsReporter() {
  useReportWebVitals(sampledForThisPage ? reportWebVital : () => undefined);
  return null;
}

const sampledForThisPage = shouldSampleWebVitals(
  process.env.NEXT_PUBLIC_RUM_ENABLED === "true",
  parseRumSampleRate(process.env.NEXT_PUBLIC_RUM_SAMPLE_RATE),
  Math.random(),
);

function reportWebVital(metric: NextWebVital) {
  const report = {
    name: metric.name,
    value: metric.value,
    delta: metric.delta,
    rating: metric.rating,
    navigationType: metric.navigationType,
    surface: normalizedWebVitalSurface(window.location.pathname),
  };
  void fetch("/api/web/vitals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => undefined);
}
