export const privateBetaFeatureKeys = [
  "integrations",
  "imports",
  "search",
  "files",
  "automation_ai",
  "billing",
] as const;

export type PrivateBetaFeatureKey = (typeof privateBetaFeatureKeys)[number];

export type ExternalEffectKind =
  | "none"
  | "provider_read"
  | "provider_write"
  | "send"
  | "publish"
  | "spend"
  | "external_delete"
  | "permission_change";

export const privateBetaOperations = [
  "integration_read",
  "integration_write",
  "integration_send",
  "integration_publish",
  "integration_delete",
  "integration_permission_change",
  "import_preview",
  "search_query",
  "file_read",
  "file_write",
  "file_delete",
  "automation_suggestion",
  "automation_read",
  "automation_write",
  "automation_send",
  "automation_publish",
  "automation_spend",
  "automation_delete",
  "automation_permission_change",
  "billing_read",
  "billing_checkout",
] as const;

export type PrivateBetaOperation = (typeof privateBetaOperations)[number];

interface PrivateBetaOperationPolicy {
  feature: PrivateBetaFeatureKey;
  effect: ExternalEffectKind;
}

const privateBetaOperationPolicies = {
  integration_read: { feature: "integrations", effect: "provider_read" },
  integration_write: { feature: "integrations", effect: "provider_write" },
  integration_send: { feature: "integrations", effect: "send" },
  integration_publish: { feature: "integrations", effect: "publish" },
  integration_delete: { feature: "integrations", effect: "external_delete" },
  integration_permission_change: {
    feature: "integrations",
    effect: "permission_change",
  },
  import_preview: { feature: "imports", effect: "none" },
  search_query: { feature: "search", effect: "none" },
  file_read: { feature: "files", effect: "provider_read" },
  file_write: { feature: "files", effect: "provider_write" },
  file_delete: { feature: "files", effect: "external_delete" },
  automation_suggestion: { feature: "automation_ai", effect: "none" },
  automation_read: { feature: "automation_ai", effect: "provider_read" },
  automation_write: { feature: "automation_ai", effect: "provider_write" },
  automation_send: { feature: "automation_ai", effect: "send" },
  automation_publish: { feature: "automation_ai", effect: "publish" },
  automation_spend: { feature: "automation_ai", effect: "spend" },
  automation_delete: { feature: "automation_ai", effect: "external_delete" },
  automation_permission_change: {
    feature: "automation_ai",
    effect: "permission_change",
  },
  billing_read: { feature: "billing", effect: "provider_read" },
  billing_checkout: { feature: "billing", effect: "spend" },
} as const satisfies Record<PrivateBetaOperation, PrivateBetaOperationPolicy>;

export interface PilotEvidenceApproval {
  decision: "approved";
  feature: PrivateBetaFeatureKey;
  evidenceIds: readonly [string, ...string[]];
  approvedBy: string;
  approvedAt: string;
}

export interface PrivateBetaOrganizationControls {
  /** Emergency stop for every provider or automated external effect. */
  externalEffectsDisabled: boolean;
  /** Features are disabled unless an organization explicitly enables them. */
  enabledFeatures: ReadonlySet<PrivateBetaFeatureKey>;
}

export interface EffectApproval {
  operation: PrivateBetaOperation;
  approvedByUserId: string;
  approvedAt: string;
  auditEventId: string;
  idempotencyKey: string;
}

export interface UsageBudget {
  limit: number;
  used: number;
  requested: number;
}

export interface PrivateBetaFeatureRequest {
  operation: PrivateBetaOperation;
  evidence?: PilotEvidenceApproval | undefined;
  configured: boolean;
  controls: PrivateBetaOrganizationControls;
  approval?: EffectApproval | undefined;
  budget?: UsageBudget | undefined;
}

export type PrivateBetaDenialReason =
  | "invalid_operation"
  | "pilot_evidence_missing"
  | "runtime_not_configured"
  | "organization_feature_disabled"
  | "organization_kill_switch"
  | "approval_required"
  | "audit_reference_required"
  | "idempotency_key_required"
  | "budget_required"
  | "budget_exhausted";

export type PrivateBetaFeatureDecision =
  | { allowed: true; feature: PrivateBetaFeatureKey }
  | {
      allowed: false;
      feature: PrivateBetaFeatureKey | "unknown";
      reason: PrivateBetaDenialReason;
    };

const killSwitchEffects = new Set<ExternalEffectKind>([
  "provider_read",
  "provider_write",
  "send",
  "publish",
  "spend",
  "external_delete",
  "permission_change",
]);
const approvalRequiredEffects = new Set<ExternalEffectKind>([
  "provider_write",
  "send",
  "publish",
  "spend",
  "external_delete",
  "permission_change",
]);

/**
 * Fail-closed release gate for capabilities that can contact a provider,
 * incur cost, or change state outside TREVV.
 *
 * This function authorizes no operation by itself. Callers must still enforce
 * tenant permissions and use an idempotent, audited adapter at execution time.
 */
export function decidePrivateBetaFeature(
  request: PrivateBetaFeatureRequest,
): PrivateBetaFeatureDecision {
  const policy = operationPolicy(request.operation);
  if (!policy) return denied("unknown", "invalid_operation");
  const { feature, effect } = policy;
  if (!validEvidence(request.evidence, feature))
    return denied(feature, "pilot_evidence_missing");
  if (!request.configured) return denied(feature, "runtime_not_configured");
  if (!request.controls.enabledFeatures.has(feature))
    return denied(feature, "organization_feature_disabled");

  if (
    request.controls.externalEffectsDisabled &&
    (killSwitchEffects.has(effect) || feature === "automation_ai")
  )
    return denied(feature, "organization_kill_switch");

  if (approvalRequiredEffects.has(effect)) {
    if (!request.approval) return denied(feature, "approval_required");
    if (
      request.approval.operation !== request.operation ||
      !request.approval.approvedByUserId.trim() ||
      !Number.isFinite(Date.parse(request.approval.approvedAt))
    )
      return denied(feature, "approval_required");
    if (!request.approval.auditEventId.trim())
      return denied(feature, "audit_reference_required");
    if (!request.approval.idempotencyKey.trim())
      return denied(feature, "idempotency_key_required");
  }

  if (feature === "automation_ai") {
    if (!request.budget) return denied(feature, "budget_required");
    if (
      !Number.isFinite(request.budget.limit) ||
      !Number.isFinite(request.budget.used) ||
      !Number.isFinite(request.budget.requested) ||
      request.budget.limit < 0 ||
      request.budget.used < 0 ||
      request.budget.requested < 1 ||
      request.budget.used + request.budget.requested > request.budget.limit
    )
      return denied(feature, "budget_exhausted");
  }

  return { allowed: true, feature };
}

export const disabledPrivateBetaControls: PrivateBetaOrganizationControls = {
  externalEffectsDisabled: true,
  enabledFeatures: new Set<PrivateBetaFeatureKey>(),
};

function operationPolicy(
  operation: unknown,
): PrivateBetaOperationPolicy | null {
  if (
    typeof operation !== "string" ||
    !Object.hasOwn(privateBetaOperationPolicies, operation)
  )
    return null;
  return privateBetaOperationPolicies[operation as PrivateBetaOperation];
}

export interface ReversibleExternalEffect {
  operationId: string;
  auditEventId: string;
  sourceRecordIds: readonly string[];
  undoSupported: boolean;
  undoUntil?: string;
}

export const deterministicAutomationAuthority = [
  "permissions",
  "dates",
  "thresholds",
  "evidence",
] as const;

export const prohibitedAutomatedDecisions = [
  "personnel",
  "financial",
  "legal",
  "permission_change",
] as const;

export interface AssistedSuggestion {
  kind: "classify" | "summarize" | "draft";
  sourceRecordIds: readonly string[];
  confidence: number;
  generatedAt: string;
}

export function validAssistedSuggestion(
  suggestion: AssistedSuggestion,
): boolean {
  return (
    suggestion.sourceRecordIds.length > 0 &&
    suggestion.sourceRecordIds.every((id) => id.trim().length > 0) &&
    Number.isFinite(suggestion.confidence) &&
    suggestion.confidence >= 0 &&
    suggestion.confidence <= 1 &&
    Number.isFinite(Date.parse(suggestion.generatedAt))
  );
}

function validEvidence(
  evidence: PilotEvidenceApproval | undefined,
  feature: PrivateBetaFeatureKey,
): evidence is PilotEvidenceApproval {
  if (
    !evidence ||
    evidence.decision !== "approved" ||
    evidence.feature !== feature
  )
    return false;
  if (evidence.evidenceIds.length === 0) return false;
  if (!evidence.evidenceIds.every((value) => value.trim().length > 0))
    return false;
  if (!evidence.approvedBy.trim()) return false;
  return Number.isFinite(Date.parse(evidence.approvedAt));
}

function denied(
  feature: PrivateBetaFeatureKey | "unknown",
  reason: PrivateBetaDenialReason,
): PrivateBetaFeatureDecision {
  return { allowed: false, feature, reason };
}
