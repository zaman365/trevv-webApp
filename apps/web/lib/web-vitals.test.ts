import { describe, expect, it } from "vitest";
import {
  normalizedWebVitalSurface,
  parseRumSampleRate,
  parseWebVitalReport,
  shouldSampleWebVitals,
} from "./web-vitals";

describe("Web Vitals telemetry", () => {
  it("uses an explicit kill switch and a bounded sample rate", () => {
    expect(parseRumSampleRate(undefined)).toBe(0.1);
    expect(parseRumSampleRate("0.25")).toBe(0.25);
    expect(parseRumSampleRate("invalid")).toBe(0);
    expect(parseRumSampleRate("2")).toBe(0);
    expect(shouldSampleWebVitals(false, 1, 0)).toBe(false);
    expect(shouldSampleWebVitals(true, 0.25, 0.24)).toBe(true);
    expect(shouldSampleWebVitals(true, 0.25, 0.25)).toBe(false);
  });

  it("removes tenant and resource identifiers from route families", () => {
    expect(
      normalizedWebVitalSurface("/app/workspaces/client-secret/messages"),
    ).toBe("/app/workspaces/:workspace/:view");
    expect(normalizedWebVitalSurface("/app/workspaces/client-secret")).toBe(
      "/app/workspaces/:workspace",
    );
    expect(normalizedWebVitalSurface("/unknown/private/value")).toBe(
      "/:unmatched",
    );
  });

  it("accepts bounded metric fields and rejects identifiers or content", () => {
    expect(
      parseWebVitalReport({
        name: "LCP",
        value: 1_234.5,
        delta: 1_234.5,
        rating: "good",
        navigationType: "navigate",
        surface: "/app/workspaces/:workspace/:view",
      }),
    ).toEqual({
      name: "LCP",
      value: 1_234.5,
      delta: 1_234.5,
      rating: "good",
      navigationType: "navigate",
      surface: "/app/workspaces/:workspace/:view",
    });
    expect(
      parseWebVitalReport({
        name: "LCP",
        value: 1,
        delta: 1,
        rating: "good",
        navigationType: "navigate",
        surface: "/app/workspaces/private-customer/messages",
      }),
    ).toBeNull();
  });
});
