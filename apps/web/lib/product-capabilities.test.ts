import { describe, expect, it } from "vitest";
import {
  capabilityStatusLabel,
  productCapabilities,
  productPreview,
  type CapabilityStatus,
} from "./product-capabilities";

const allowedStatuses = new Set<CapabilityStatus>([
  "live",
  "preview",
  "demo-only",
  "unavailable",
]);

describe("product capability truth", () => {
  it("keeps every capability in the supported status vocabulary", () => {
    for (const capability of Object.values(productCapabilities)) {
      expect(allowedStatuses.has(capability.status)).toBe(true);
      expect(capabilityStatusLabel[capability.status]).toBeTruthy();
      expect(capability.title).toBeTruthy();
      expect(capability.description).toBeTruthy();
    }
  });

  it("does not advertise an external, durable, security, or paid effect as live", () => {
    const nonLiveCapabilities = [
      "authentication",
      "browserChanges",
      "messages",
      "waitingFollowUp",
      "email",
      "integrations",
      "import",
      "export",
      "security",
      "invitations",
      "publishedUpdates",
      "automation",
      "uploads",
      "billing",
    ] as const;

    for (const key of nonLiveCapabilities) {
      expect(productCapabilities[key].status).not.toBe("live");
    }
  });

  it("locks the current high-risk capability boundaries", () => {
    expect(
      Object.fromEntries(
        Object.entries(productCapabilities).map(([key, value]) => [
          key,
          value.status,
        ]),
      ),
    ).toEqual({
      authentication: "unavailable",
      automation: "preview",
      billing: "unavailable",
      browserChanges: "demo-only",
      email: "demo-only",
      export: "demo-only",
      import: "preview",
      integrations: "preview",
      invitations: "demo-only",
      messages: "demo-only",
      publishedUpdates: "demo-only",
      security: "unavailable",
      teams: "demo-only",
      uploads: "unavailable",
      waitingFollowUp: "preview",
    });
  });

  it("states the preview data and persistence boundary in one shared label", () => {
    expect(productPreview.conciseLabel).toContain("Technical preview");
    expect(productPreview.conciseLabel).toContain("fictional data");
    expect(productPreview.conciseLabel).toContain("stay in this browser");
  });
});
