import { describe, expect, it } from "vitest";
import {
  decideProviderRelease,
  disconnectedProvider,
  parseSmartLink,
  privateBetaProviderCatalog,
  type ProviderSafetyReadiness,
} from "./index";

describe("smart links", () => {
  it.each([
    ["https://www.figma.com/design/abc/launch", "figma"],
    ["https://github.com/founderhq/app/pull/12", "github"],
    ["https://www.canva.com/design/abc", "canva"],
  ])("detects %s", (url, provider) =>
    expect(parseSmartLink(url)?.provider).toBe(provider),
  );
  it("rejects unsafe and invalid URLs", () => {
    expect(parseSmartLink("javascript:alert(1)")).toBeNull();
    expect(parseSmartLink("not a URL")).toBeNull();
  });
});

const ready: ProviderSafetyReadiness = {
  encryptedCredentialStorage: true,
  leastScopesReviewed: true,
  webhookReplayProtection: true,
  refreshAndRevocation: true,
  retryAndReconciliation: true,
  disconnectAndDeletion: true,
};

describe("private-beta provider safety", () => {
  it("keeps every catalog provider disabled without pilot evidence", () => {
    for (const provider of privateBetaProviderCatalog) {
      expect(decideProviderRelease(provider, undefined, ready)).toMatchObject({
        provider,
        state: "disabled_no_pilot_evidence",
      });
    }
    expect(
      decideProviderRelease(
        "github",
        {
          provider: "github",
          evidenceIds: [] as unknown as [string, ...string[]],
          approvedBy: "product-owner",
          approvedAt: "2026-08-29T12:00:00.000Z",
          allowExternalWrites: false,
        },
        ready,
      ),
    ).toMatchObject({ state: "disabled_no_pilot_evidence" });
  });

  it("does not call an approved provider ready before every safety control", () => {
    expect(
      decideProviderRelease(
        "google_calendar",
        {
          provider: "google_calendar",
          evidenceIds: ["pilot-12"],
          approvedBy: "product-owner",
          approvedAt: "2026-08-29T12:00:00.000Z",
          allowExternalWrites: false,
        },
        { ...ready, retryAndReconciliation: false },
      ),
    ).toMatchObject({ state: "approved_not_ready" });
  });

  it("keeps external writes approval-gated after operational readiness", () => {
    expect(
      decideProviderRelease(
        "github",
        {
          provider: "github",
          evidenceIds: ["pilot-23"],
          approvedBy: "product-owner",
          approvedAt: "2026-08-29T12:00:00.000Z",
          allowExternalWrites: true,
        },
        ready,
      ),
    ).toMatchObject({ state: "ready_approval_required" });
  });

  it("fails closed when runtime readiness omits a required control", () => {
    expect(
      decideProviderRelease(
        "github",
        {
          provider: "github",
          evidenceIds: ["pilot-23"],
          approvedBy: "product-owner",
          approvedAt: "2026-08-29T12:00:00.000Z",
          allowExternalWrites: false,
        },
        {} as ProviderSafetyReadiness,
      ),
    ).toMatchObject({ state: "approved_not_ready" });
  });

  it("does not reuse pilot approval across providers", () => {
    expect(
      decideProviderRelease(
        "google_calendar",
        {
          provider: "github",
          evidenceIds: ["github-pilot-23"],
          approvedBy: "product-owner",
          approvedAt: "2026-08-29T12:00:00.000Z",
          allowExternalWrites: false,
        },
        ready,
      ),
    ).toMatchObject({ state: "disabled_no_pilot_evidence" });
  });

  it("never claims an unconfigured disconnect revoked provider access", async () => {
    await expect(
      disconnectedProvider("github").disconnect("missing"),
    ).rejects.toThrow("no credential was revoked");
  });
});
