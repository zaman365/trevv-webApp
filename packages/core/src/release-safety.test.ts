import { describe, expect, it } from "vitest";
import {
  decidePrivateBetaFeature,
  deterministicAutomationAuthority,
  disabledPrivateBetaControls,
  prohibitedAutomatedDecisions,
  validAssistedSuggestion,
  type PilotEvidenceApproval,
  type PrivateBetaFeatureRequest,
} from "./release-safety.js";

const evidence: PilotEvidenceApproval = {
  decision: "approved",
  feature: "integrations",
  evidenceIds: ["pilot-interview-17"],
  approvedBy: "product-owner",
  approvedAt: "2026-08-29T12:00:00.000Z",
};

function request(
  overrides: Partial<PrivateBetaFeatureRequest> = {},
): PrivateBetaFeatureRequest {
  return {
    operation: "integration_read",
    evidence,
    configured: true,
    controls: {
      externalEffectsDisabled: false,
      enabledFeatures: new Set(["integrations"]),
    },
    ...overrides,
  };
}

describe("private-beta release safety", () => {
  it("defaults every evidence-gated capability to disabled", () => {
    expect(
      decidePrivateBetaFeature(
        request({ evidence: undefined, controls: disabledPrivateBetaControls }),
      ),
    ).toEqual({
      allowed: false,
      feature: "integrations",
      reason: "pilot_evidence_missing",
    });
  });

  it("does not treat a roadmap recommendation as pilot approval", () => {
    expect(
      decidePrivateBetaFeature(request({ evidence: undefined })),
    ).toMatchObject({ allowed: false, reason: "pilot_evidence_missing" });
    expect(
      decidePrivateBetaFeature(
        request({
          evidence: {
            ...evidence,
            evidenceIds: [] as unknown as PilotEvidenceApproval["evidenceIds"],
          },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "pilot_evidence_missing" });
  });

  it("requires configuration and explicit organization enablement", () => {
    expect(
      decidePrivateBetaFeature(request({ configured: false })),
    ).toMatchObject({ allowed: false, reason: "runtime_not_configured" });
    expect(
      decidePrivateBetaFeature(
        request({
          controls: {
            externalEffectsDisabled: false,
            enabledFeatures: new Set(),
          },
        }),
      ),
    ).toMatchObject({
      allowed: false,
      reason: "organization_feature_disabled",
    });
  });

  it("requires approval, audit, idempotency, and an open kill switch for writes", () => {
    expect(
      decidePrivateBetaFeature(
        request({
          operation: "integration_send",
          controls: {
            externalEffectsDisabled: true,
            enabledFeatures: new Set(["integrations"]),
          },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "organization_kill_switch" });

    expect(
      decidePrivateBetaFeature(request({ operation: "integration_write" })),
    ).toMatchObject({ allowed: false, reason: "approval_required" });

    expect(
      decidePrivateBetaFeature(
        request({
          operation: "integration_write",
          approval: {
            operation: "integration_write",
            approvedByUserId: "user-1",
            approvedAt: "2026-08-29T12:01:00.000Z",
            auditEventId: "",
            idempotencyKey: "write-1",
          },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "audit_reference_required" });

    expect(
      decidePrivateBetaFeature(
        request({
          operation: "integration_write",
          approval: {
            operation: "integration_write",
            approvedByUserId: "user-1",
            approvedAt: "2026-08-29T12:01:00.000Z",
            auditEventId: "audit-1",
            idempotencyKey: "",
          },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "idempotency_key_required" });
  });

  it("applies the organization kill switch to provider reads and automation", () => {
    const killed = {
      externalEffectsDisabled: true,
      enabledFeatures: new Set(["integrations", "automation_ai"] as const),
    };
    expect(
      decidePrivateBetaFeature(request({ controls: killed })),
    ).toMatchObject({ allowed: false, reason: "organization_kill_switch" });
    expect(
      decidePrivateBetaFeature(
        request({
          operation: "automation_suggestion",
          evidence: { ...evidence, feature: "automation_ai" },
          controls: killed,
          budget: { limit: 10, used: 0, requested: 1 },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "organization_kill_switch" });
  });

  it("enforces an explicit automation/AI budget", () => {
    const controls = {
      externalEffectsDisabled: false,
      enabledFeatures: new Set(["automation_ai"] as const),
    };
    expect(
      decidePrivateBetaFeature(
        request({
          operation: "automation_suggestion",
          evidence: { ...evidence, feature: "automation_ai" },
          controls,
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "budget_required" });
    expect(
      decidePrivateBetaFeature(
        request({
          operation: "automation_suggestion",
          evidence: { ...evidence, feature: "automation_ai" },
          controls,
          budget: { limit: 100, used: 100, requested: 1 },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "budget_exhausted" });
    expect(
      decidePrivateBetaFeature(
        request({
          operation: "automation_suggestion",
          evidence: { ...evidence, feature: "automation_ai" },
          controls,
          budget: { limit: Number.NaN, used: 0, requested: 1 },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "budget_exhausted" });
  });

  it("allows a fully approved read without authorizing execution itself", () => {
    expect(decidePrivateBetaFeature(request())).toEqual({
      allowed: true,
      feature: "integrations",
    });
  });

  it("derives external effects from the operation instead of caller data", () => {
    const forged = {
      ...request({ operation: "integration_write" }),
      effect: "none",
    } as PrivateBetaFeatureRequest;
    expect(decidePrivateBetaFeature(forged)).toMatchObject({
      allowed: false,
      reason: "approval_required",
    });
  });

  it("binds evidence and effect approvals to their exact capability", () => {
    expect(
      decidePrivateBetaFeature(
        request({ evidence: { ...evidence, feature: "billing" } }),
      ),
    ).toMatchObject({ allowed: false, reason: "pilot_evidence_missing" });

    expect(
      decidePrivateBetaFeature(
        request({
          operation: "integration_write",
          approval: {
            operation: "integration_send",
            approvedByUserId: "user-1",
            approvedAt: "2026-08-29T12:01:00.000Z",
            auditEventId: "audit-1",
            idempotencyKey: "write-1",
          },
        }),
      ),
    ).toMatchObject({ allowed: false, reason: "approval_required" });
  });

  it("fails closed for an unknown runtime operation", () => {
    expect(
      decidePrivateBetaFeature(
        request({
          operation:
            "not-a-real-operation" as PrivateBetaFeatureRequest["operation"],
        }),
      ),
    ).toEqual({
      allowed: false,
      feature: "unknown",
      reason: "invalid_operation",
    });
  });

  it("requires AI suggestions to cite canonical sources and confidence", () => {
    expect(
      validAssistedSuggestion({
        kind: "draft",
        sourceRecordIds: [],
        confidence: 0.8,
        generatedAt: "2026-08-29T12:00:00.000Z",
      }),
    ).toBe(false);
    expect(
      validAssistedSuggestion({
        kind: "summarize",
        sourceRecordIds: ["work-item-1", "update-4"],
        confidence: 0.82,
        generatedAt: "2026-08-29T12:00:00.000Z",
      }),
    ).toBe(true);
    expect(deterministicAutomationAuthority).toContain("permissions");
    expect(prohibitedAutomatedDecisions).toContain("financial");
  });
});
