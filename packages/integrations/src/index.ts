export type ProviderKey =
  | "google_drive"
  | "google_calendar"
  | "microsoft_outlook_calendar"
  | "figma"
  | "github"
  | "canva"
  | "google_docs"
  | "slack"
  | "shopify"
  | "generic";

export interface ExternalResource {
  provider: ProviderKey;
  providerId?: string;
  name: string;
  url: string;
  mimeType?: string;
  thumbnailUrl?: string;
  ownerName?: string;
  modifiedAt?: string;
}

export interface ResourceProvider {
  readonly key: ProviderKey;
  connect(state: string): Promise<{ authorizationUrl: string }>;
  disconnect(connectionId: string): Promise<void>;
  verifyWebhook(headers: Headers, body: Uint8Array): Promise<boolean>;
}

export type ProviderReleaseState =
  | "disabled_no_pilot_evidence"
  | "approved_not_ready"
  | "ready_read_only"
  | "ready_approval_required";

export interface ProviderPilotApproval {
  provider: Exclude<ProviderKey, "generic">;
  evidenceIds: readonly [string, ...string[]];
  approvedBy: string;
  approvedAt: string;
  allowExternalWrites: boolean;
}

export interface ProviderSafetyReadiness {
  encryptedCredentialStorage: boolean;
  leastScopesReviewed: boolean;
  webhookReplayProtection: boolean;
  refreshAndRevocation: boolean;
  retryAndReconciliation: boolean;
  disconnectAndDeletion: boolean;
}

export interface ProviderReleaseDecision {
  provider: Exclude<ProviderKey, "generic">;
  state: ProviderReleaseState;
  reason: string;
}

export interface EncryptedProviderCredential {
  algorithm: "aes-256-gcm";
  keyId: string;
  initializationVector: string;
  ciphertext: string;
  authenticationTag: string;
  createdAt: string;
}

export const privateBetaProviderCatalog = [
  "google_calendar",
  "microsoft_outlook_calendar",
  "github",
  "slack",
  "google_drive",
  "figma",
  "canva",
  "google_docs",
  "shopify",
] as const satisfies readonly Exclude<ProviderKey, "generic">[];

/**
 * Provider enablement is evidence-gated and fail-closed. This repository has
 * no approved provider at present, so callers must pass an approval captured
 * by a separate product decision before readiness can advance.
 */
export function decideProviderRelease(
  provider: Exclude<ProviderKey, "generic">,
  approval: ProviderPilotApproval | undefined,
  readiness: ProviderSafetyReadiness,
): ProviderReleaseDecision {
  if (!validProviderApproval(approval, provider)) {
    return {
      provider,
      state: "disabled_no_pilot_evidence",
      reason: "No approved pilot evidence is recorded for this provider.",
    };
  }
  if (!providerSafetyReady(readiness)) {
    return {
      provider,
      state: "approved_not_ready",
      reason:
        "Required credential, webhook, recovery, and deletion controls are incomplete.",
    };
  }
  return approval.allowExternalWrites
    ? {
        provider,
        state: "ready_approval_required",
        reason: "Every provider write still requires explicit user approval.",
      }
    : {
        provider,
        state: "ready_read_only",
        reason: "Provider access is limited to approved read-only scopes.",
      };
}

const providerHosts: ReadonlyArray<[ProviderKey, RegExp]> = [
  ["figma", /(^|\.)figma\.com$/i],
  ["github", /(^|\.)github\.com$/i],
  ["canva", /(^|\.)canva\.com$/i],
  ["google_docs", /(^|\.)docs\.google\.com$/i],
  ["slack", /(^|\.)slack\.com$/i],
  ["shopify", /(^|\.)shopify\.com$/i],
];

export function parseSmartLink(input: string): ExternalResource | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:") return null;
    const provider =
      providerHosts.find(([, host]) => host.test(url.hostname))?.[0] ??
      "generic";
    return { provider, name: titleFromPath(url), url: url.toString() };
  } catch {
    return null;
  }
}

function titleFromPath(url: URL): string {
  const meaningful = url.pathname
    .split("/")
    .filter(Boolean)
    .slice(-2)
    .join(" / ")
    .replace(/[-_]/g, " ");
  return meaningful || url.hostname;
}

export const disconnectedProvider = (key: ProviderKey): ResourceProvider => ({
  key,
  connect: async () => {
    throw new Error(`${key} is not configured.`);
  },
  disconnect: async () => {
    throw new Error(`${key} is not configured; no credential was revoked.`);
  },
  verifyWebhook: async () => false,
});

function validProviderApproval(
  approval: ProviderPilotApproval | undefined,
  provider: Exclude<ProviderKey, "generic">,
): approval is ProviderPilotApproval {
  return Boolean(
    approval &&
    approval.provider === provider &&
    approval.evidenceIds.length > 0 &&
    approval.evidenceIds.every((id) => id.trim()) &&
    approval.approvedBy.trim() &&
    Number.isFinite(Date.parse(approval.approvedAt)) &&
    typeof approval.allowExternalWrites === "boolean",
  );
}

function providerSafetyReady(readiness: ProviderSafetyReadiness): boolean {
  return (
    readiness.encryptedCredentialStorage === true &&
    readiness.leastScopesReviewed === true &&
    readiness.webhookReplayProtection === true &&
    readiness.refreshAndRevocation === true &&
    readiness.retryAndReconciliation === true &&
    readiness.disconnectAndDeletion === true
  );
}
