#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { claimsAuthorization } from "./phase6-claims.mjs";
import { readinessAuthorization } from "./phase6-readiness.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, "..");
const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const releaseIdPattern = /^[a-z0-9][a-z0-9._+-]{7,127}$/u;
const requiredServices = ["api", "migrate", "web", "worker"];
const requiredSecurityModeKeys = [
  "cspMode",
  "demoMode",
  "errorReportingMode",
  "hstsEnabled",
  "rateLimitBackend",
  "registrationMode",
];
const requiredAuthorizationConfirmations = [
  "backupAndRestoreEvidenceReviewed",
  "claimsRegisterGo",
  "commercialEvidenceReviewed",
  "evidenceContentAndReleaseIdsVerified",
  "migrationAndRollbackEvidenceReviewed",
  "productMetricsGatePassed",
  "readinessRegisterGo",
  "sameArtifactsAsStaging",
  "securityAndLegalEvidenceReviewed",
  "supportAndIncidentEvidenceReviewed",
];
export const evidenceTemplateFiles = Object.freeze({
  accessibility: "accessibility-review.template.json",
  availability: "availability-window.template.json",
  billing: "billing-lifecycle.template.json",
  ci: "ci-gates.template.json",
  claims: "claims-review.template.json",
  deployment: "deployment-rehearsal.template.json",
  incident: "incident-exercise.template.json",
  legal: "legal-review.template.json",
  migration: "migration-rehearsal.template.json",
  performance: "performance-review.template.json",
  privacy: "privacy-lifecycle.template.json",
  product_metrics: "product-metrics.template.json",
  provider_scope: "provider-scope.template.json",
  restore: "restore-drill.template.json",
  rollback: "rollback-rehearsal.template.json",
  security_review: "security-review.template.json",
  support: "support-readiness.template.json",
});
export const requiredEvidenceKinds = Object.freeze(
  Object.keys(evidenceTemplateFiles).sort(),
);

export function createReleaseManifest(
  input,
  { repositoryRoot = defaultRepositoryRoot, worktreeStatus } = {},
) {
  if (input?.template === true)
    throw new Error(
      "Refusing to generate a release manifest from an unfilled template.",
    );
  assertCleanRepositoryWorktree(repositoryRoot, {
    statusOutput: worktreeStatus,
  });
  const gitSha =
    input.gitSha === "AUTO" || !input.gitSha
      ? repositoryGitSha(repositoryRoot)
      : input.gitSha;
  const migrationHead = repositoryMigrationHead(repositoryRoot);
  const openapiSha256 = fileDigest(resolve(repositoryRoot, "openapi.json"));
  const manifest = {
    schemaVersion: 1,
    releaseId: input.releaseId,
    createdAt: input.createdAt,
    gitSha,
    imageDigests: sortObject(input.imageDigests),
    database: {
      migrationHead,
      previousReleaseMigrationHead:
        input.database?.previousReleaseMigrationHead,
      strategy: input.database?.strategy,
    },
    contracts: { openapiSha256 },
    runtimes: sortObject(input.runtimes),
    securityModes: sortObject(input.securityModes),
    previousRelease: sortObject(input.previousRelease),
    evidenceLinks: [...(input.evidenceLinks ?? [])].sort((left, right) =>
      String(left.kind).localeCompare(String(right.kind)),
    ),
    authorization: sortObject(input.authorization),
  };
  const payloadSha256 = contentDigest(manifest);
  return { ...manifest, integrity: { payloadSha256 } };
}

export function validateReleaseManifest(
  manifest,
  {
    forProduction = false,
    repositoryRoot = defaultRepositoryRoot,
    readinessRegister,
    claimsInventory,
    asOf = new Date().toISOString().slice(0, 10),
    worktreeStatus,
    evidenceVerifier,
    authorizationVerifier,
  } = {},
) {
  const errors = [];
  if (!manifest || typeof manifest !== "object")
    return ["Manifest must be a JSON object."];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (!releaseIdPattern.test(String(manifest.releaseId ?? "")))
    errors.push("releaseId is invalid.");
  if (!isTimestamp(manifest.createdAt))
    errors.push("createdAt must be a UTC ISO timestamp.");
  if (!gitShaPattern.test(String(manifest.gitSha ?? "")))
    errors.push("gitSha must be a full lowercase Git SHA.");

  for (const service of requiredServices) {
    if (!digestPattern.test(String(manifest.imageDigests?.[service] ?? "")))
      errors.push(
        `imageDigests.${service} must be an immutable sha256 digest.`,
      );
  }
  const imageKeys = Object.keys(manifest.imageDigests ?? {}).sort();
  if (JSON.stringify(imageKeys) !== JSON.stringify(requiredServices))
    errors.push(
      `imageDigests must contain exactly: ${requiredServices.join(", ")}.`,
    );

  if (
    !/^\d{4}_[a-z0-9_]+$/u.test(String(manifest.database?.migrationHead ?? ""))
  )
    errors.push("database.migrationHead is invalid.");
  if (
    !/^\d{4}_[a-z0-9_]+$/u.test(
      String(manifest.database?.previousReleaseMigrationHead ?? ""),
    )
  )
    errors.push("database.previousReleaseMigrationHead is invalid.");
  if (manifest.database?.strategy !== "additive-forward-only")
    errors.push("database.strategy must be additive-forward-only.");
  if (!digestPattern.test(String(manifest.contracts?.openapiSha256 ?? "")))
    errors.push("contracts.openapiSha256 must be a sha256 digest.");
  if (!/^\d+\.\d+\.\d+$/u.test(String(manifest.runtimes?.node ?? "")))
    errors.push("runtimes.node must be an exact semantic version.");
  if (!/^\d+\.\d+\.\d+$/u.test(String(manifest.runtimes?.pnpm ?? "")))
    errors.push("runtimes.pnpm must be an exact semantic version.");
  if (manifest.securityModes?.demoMode !== false)
    errors.push("securityModes.demoMode must be false.");
  const securityModeKeys = Object.keys(manifest.securityModes ?? {}).sort();
  if (
    JSON.stringify(securityModeKeys) !==
    JSON.stringify(requiredSecurityModeKeys)
  )
    errors.push(
      `securityModes must contain exactly: ${requiredSecurityModeKeys.join(", ")}.`,
    );
  if (
    !new Set(["closed", "invite_only", "public"]).has(
      manifest.securityModes?.registrationMode,
    )
  )
    errors.push("securityModes.registrationMode is invalid.");
  if (!new Set(["report-only", "enforce"]).has(manifest.securityModes?.cspMode))
    errors.push("securityModes.cspMode is invalid.");
  if (typeof manifest.securityModes?.hstsEnabled !== "boolean")
    errors.push("securityModes.hstsEnabled must be boolean.");
  if (
    !new Set(["memory", "postgres"]).has(
      manifest.securityModes?.rateLimitBackend,
    )
  )
    errors.push("securityModes.rateLimitBackend is invalid.");
  if (
    !new Set(["disabled", "external"]).has(
      manifest.securityModes?.errorReportingMode,
    )
  )
    errors.push("securityModes.errorReportingMode is invalid.");
  if (!releaseIdPattern.test(String(manifest.previousRelease?.releaseId ?? "")))
    errors.push("previousRelease.releaseId is invalid.");
  if (
    !digestPattern.test(String(manifest.previousRelease?.manifestDigest ?? ""))
  )
    errors.push(
      "previousRelease.manifestDigest must be an immutable sha256 digest.",
    );

  const evidenceKinds = new Set();
  for (const [index, link] of (manifest.evidenceLinks ?? []).entries()) {
    if (!requiredEvidenceKinds.includes(link?.kind))
      errors.push(`evidenceLinks[${index}].kind is unsupported.`);
    if (evidenceKinds.has(link?.kind))
      errors.push(`Duplicate evidence kind: ${String(link?.kind)}.`);
    evidenceKinds.add(link?.kind);
    if (!validEvidenceUri(link?.uri))
      errors.push(
        `evidenceLinks[${index}].uri must be an immutable HTTPS or URN reference.`,
      );
    if (!digestPattern.test(String(link?.sha256 ?? "")))
      errors.push(
        `evidenceLinks[${index}].sha256 must bind the referenced evidence content.`,
      );
  }

  if (
    !new Set(["authorized", "not_authorized"]).has(
      manifest.authorization?.status,
    )
  )
    errors.push("authorization.status is invalid.");
  if (manifest.authorization?.environment !== "production")
    errors.push("authorization.environment must be production.");
  if (manifest.authorization?.status === "not_authorized") {
    for (const field of [
      "authorizedBy",
      "authorizedAt",
      "changeTicket",
      "scopeDigest",
    ])
      if (manifest.authorization?.[field] !== null)
        errors.push(
          `authorization.${field} must be null while not authorized.`,
        );
  }
  if (manifest.authorization?.status === "authorized") {
    for (const field of ["authorizedBy", "changeTicket"])
      if (
        typeof manifest.authorization?.[field] !== "string" ||
        manifest.authorization[field].trim().length < 3
      )
        errors.push(`authorization.${field} is required for authorization.`);
    if (!isTimestamp(manifest.authorization?.authorizedAt))
      errors.push("authorization.authorizedAt must be a UTC ISO timestamp.");
    if (!digestPattern.test(String(manifest.authorization?.scopeDigest ?? "")))
      errors.push("authorization.scopeDigest must be a sha256 digest.");
    else if (
      manifest.authorization.scopeDigest !==
      releaseAuthorizationScopeDigest(manifest)
    )
      errors.push(
        "authorization.scopeDigest does not match the canonical release scope.",
      );
  }

  const withoutIntegrity = { ...manifest };
  delete withoutIntegrity.integrity;
  const expectedIntegrity = contentDigest(withoutIntegrity);
  if (manifest.integrity?.payloadSha256 !== expectedIntegrity)
    errors.push(
      "integrity.payloadSha256 does not match the canonical manifest payload.",
    );

  if (repositoryRoot && existsSync(resolve(repositoryRoot, ".git"))) {
    if (
      gitShaPattern.test(String(manifest.gitSha ?? "")) &&
      manifest.gitSha !== repositoryGitSha(repositoryRoot)
    )
      errors.push("gitSha does not match the checked-out repository.");
    if (
      manifest.database?.migrationHead !==
      repositoryMigrationHead(repositoryRoot)
    )
      errors.push(
        "database.migrationHead does not match the migration journal.",
      );
    if (
      manifest.contracts?.openapiSha256 !==
      fileDigest(resolve(repositoryRoot, "openapi.json"))
    )
      errors.push("contracts.openapiSha256 does not match openapi.json.");
  }

  if (forProduction) {
    const worktreeChanges = repositoryWorktreeChanges(repositoryRoot, {
      statusOutput: worktreeStatus,
    });
    if (worktreeChanges.length > 0)
      errors.push(
        `Production authorization requires a clean Git worktree; found ${worktreeChanges.length} tracked or untracked change(s).`,
      );
    verifyProductionEvidence(manifest, evidenceVerifier, errors, {
      claimsInventory,
      asOf,
    });
    verifyProductionAuthorization(manifest, authorizationVerifier, errors);
    for (const kind of requiredEvidenceKinds)
      if (!evidenceKinds.has(kind))
        errors.push(`Production authorization requires ${kind} evidence.`);
    if (manifest.authorization?.status !== "authorized")
      errors.push("Production authorization is not explicit.");
    if (manifest.securityModes?.cspMode !== "enforce")
      errors.push("Production authorization requires enforcing CSP.");
    if (manifest.securityModes?.registrationMode === "public")
      errors.push(
        "Production authorization requires closed or invite_only registration.",
      );
    if (manifest.securityModes?.hstsEnabled !== true)
      errors.push(
        "Production authorization requires reviewed HSTS enablement.",
      );
    if (manifest.securityModes?.rateLimitBackend !== "postgres")
      errors.push(
        "Production authorization requires the shared PostgreSQL limiter.",
      );
    if (manifest.securityModes?.errorReportingMode !== "external")
      errors.push(
        "Production authorization requires reviewed external error reporting.",
      );
    if (!readinessRegister)
      errors.push("Production authorization requires a readiness register.");
    else {
      const decision = readinessAuthorization(readinessRegister, {
        asOf,
        repositoryRoot,
      });
      if (!decision.authorized)
        errors.push(
          ...decision.blockers.map((blocker) => `Readiness gate: ${blocker}`),
        );
    }
    if (!claimsInventory)
      errors.push("Production authorization requires a claims inventory.");
    else {
      const decision = claimsAuthorization(claimsInventory, {
        asOf,
        repositoryRoot,
      });
      if (!decision.authorized)
        errors.push(
          ...decision.blockers.map((blocker) => `Claims gate: ${blocker}`),
        );
    }
  }

  return errors;
}

export function writeImmutableManifest(path, manifest) {
  const descriptor = openSync(
    path,
    constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
    0o444,
  );
  try {
    writeFileSync(descriptor, `${stableStringify(manifest)}\n`, "utf8");
  } finally {
    closeSync(descriptor);
  }
}

export function repositoryWorktreeChanges(
  repositoryRoot = defaultRepositoryRoot,
  { statusOutput } = {},
) {
  const output =
    statusOutput ??
    execFileSync(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );
  if (typeof output !== "string")
    throw new TypeError("Git worktree status must be a string.");
  return output.split("\0").filter((entry) => entry.length > 0);
}

function assertCleanRepositoryWorktree(repositoryRoot, { statusOutput } = {}) {
  const changes = repositoryWorktreeChanges(repositoryRoot, { statusOutput });
  if (changes.length > 0)
    throw new Error(
      `Refusing to generate a release manifest from a dirty Git worktree; found ${changes.length} tracked or untracked change(s).`,
    );
}

export function stableStringify(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}`;
}

export function releaseAuthorizationScope(manifest) {
  return {
    ...releaseArtifactIdentity(manifest),
    evidenceLinks: [...(manifest.evidenceLinks ?? [])]
      .map(({ kind, sha256, uri }) => ({ kind, sha256, uri }))
      .sort((left, right) =>
        String(left.kind).localeCompare(String(right.kind)),
      ),
  };
}

export function releaseArtifactIdentity(manifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    releaseId: manifest.releaseId,
    gitSha: manifest.gitSha,
    imageDigests: sortObject(manifest.imageDigests),
    database: sortObject(manifest.database),
    contracts: sortObject(manifest.contracts),
    runtimes: sortObject(manifest.runtimes),
    securityModes: sortObject(manifest.securityModes),
    previousRelease: sortObject(manifest.previousRelease),
  };
}

export function releaseArtifactIdentityDigest(manifest) {
  return contentDigest(releaseArtifactIdentity(manifest));
}

export function releaseAuthorizationScopeDigest(manifest) {
  return contentDigest(releaseAuthorizationScope(manifest));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  return value;
}

function contentDigest(value) {
  return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`;
}

function rawContentDigest(value) {
  if (typeof value !== "string" && !(value instanceof Uint8Array))
    throw new TypeError("Verified evidence content must be a string or bytes.");
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function parseVerifiedJsonContent(value) {
  const text =
    typeof value === "string" ? value : new TextDecoder().decode(value);
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new TypeError("Verified evidence content must be a JSON object.");
  return parsed;
}

function verifyProductionEvidence(
  manifest,
  verifier,
  errors,
  { claimsInventory, asOf },
) {
  if (typeof verifier !== "function") {
    errors.push(
      "Production authorization requires an external evidence-content verifier.",
    );
    return;
  }
  for (const link of manifest.evidenceLinks ?? []) {
    const label = `Evidence ${String(link?.kind)}`;
    try {
      const verified = verifier(link, { releaseId: manifest.releaseId });
      if (verified instanceof Promise)
        throw new TypeError(
          "Evidence verification must complete synchronously.",
        );
      if (!verified || typeof verified !== "object")
        throw new TypeError("Verifier returned no evidence content.");
      if (verified.uri !== link.uri)
        throw new Error("verified URI does not match the manifest link");
      const measuredDigest = rawContentDigest(verified.content);
      if (measuredDigest !== link.sha256)
        throw new Error("verified content digest does not match the manifest");
      const record = parseVerifiedJsonContent(verified.content);
      if (record.schemaVersion !== 1)
        throw new Error("evidence schemaVersion must equal 1");
      if (record.evidenceKind !== link.kind)
        throw new Error("evidenceKind does not match the manifest link");
      if (record.template !== false)
        throw new Error("evidence must explicitly be a completed template");
      if (record.releaseId !== manifest.releaseId)
        throw new Error("evidence releaseId does not match the manifest");
      if (record.result !== "PASS")
        throw new Error("evidence result is not PASS");
      validateEvidenceSemantics(link.kind, record, manifest, {
        claimsInventory,
        asOf,
      });
      if (link.kind === "security_review") {
        const reportArtifact = requireDigestArtifact(
          record.artifacts,
          record.reportReference,
          "security report",
        );
        verifyBoundArtifact(reportArtifact, verifier, {
          evidenceKind: link.kind,
          releaseId: manifest.releaseId,
        });
        for (const acceptedRisk of record.findings.acceptedRiskReferences)
          verifyBoundArtifact(acceptedRisk, verifier, {
            evidenceKind: "security_accepted_risk",
            releaseId: manifest.releaseId,
          });
      }
    } catch (error) {
      errors.push(
        `${label} verification failed: ${error instanceof Error ? error.message : String(error)}.`,
      );
    }
  }
}

function validateEvidenceSemantics(
  kind,
  record,
  manifest,
  { claimsInventory, asOf },
) {
  switch (kind) {
    case "accessibility":
      requireStatus(record, "completed");
      requireAllTrueChecks(record.checks, [
        "chromiumCriticalPaths",
        "highContrast",
        "keyboard",
        "reducedMotion",
        "screenReader",
        "touchTargets",
        "wcagA",
        "wcagAA",
        "webkitCriticalPaths",
        "zoom200Percent",
      ]);
      requireZero(record.unreviewedFindings, "unreviewedFindings");
      requirePositive(record.criticalPathCount, "criticalPathCount");
      requireNoFailuresAndArtifacts(record);
      return;
    case "availability":
      requireStatus(record, "measured");
      requireTimestampRange(record.window?.startedAt, record.window?.endedAt);
      requireAtLeast(record.window?.minimumDays, 30, "window.minimumDays");
      requireMinimumWindowDays(
        record.window.startedAt,
        record.window.endedAt,
        record.window.minimumDays,
        "window",
      );
      requirePositive(record.window?.customerMinutes, "window.customerMinutes");
      requireNonNegative(
        record.window?.unavailableMinutes,
        "window.unavailableMinutes",
      );
      requireNonNegative(
        record.window?.excludedMaintenanceMinutes,
        "window.excludedMaintenanceMinutes",
      );
      requireAtLeast(
        record.window?.targetAvailabilityPercent,
        99.9,
        "window.targetAvailabilityPercent",
      );
      requireAtLeast(
        record.window?.measuredAvailabilityPercent,
        record.window.targetAvailabilityPercent,
        "window.measuredAvailabilityPercent",
      );
      requireAtMost(
        record.window?.measuredAvailabilityPercent,
        100,
        "window.measuredAvailabilityPercent",
      );
      const measuredCustomerMinutes =
        record.window.customerMinutes -
        record.window.excludedMaintenanceMinutes;
      requirePositive(
        measuredCustomerMinutes,
        "window.measuredCustomerMinutes",
      );
      if (record.window.unavailableMinutes > measuredCustomerMinutes)
        throw new Error(
          "window.unavailableMinutes exceeds measured customer minutes",
        );
      requireApproximatelyEqual(
        record.window.measuredAvailabilityPercent,
        ((measuredCustomerMinutes - record.window.unavailableMinutes) /
          measuredCustomerMinutes) *
          100,
        "window.measuredAvailabilityPercent",
      );
      requireNonEmptyString(
        record.measurement?.collector,
        "measurement.collector",
      );
      requireNonEmptyString(record.measurement?.query, "measurement.query");
      requireNonEmptyString(
        record.measurement?.errorBudgetPolicy,
        "measurement.errorBudgetPolicy",
      );
      requireNonEmptyString(
        record.measurement?.staffedResponseSchedule,
        "measurement.staffedResponseSchedule",
      );
      requireNonEmptyArray(
        record.measurement?.syntheticChecks,
        "measurement.syntheticChecks",
      );
      requireNoFailuresAndArtifacts(record);
      return;
    case "billing":
      requireStatus(record, "completed");
      requireNonEmptyString(
        record.approvedPricingReference,
        "approvedPricingReference",
      );
      requireExactStringSet(record.approvedPlanKeys, ["founder", "startup"]);
      requireAllTrueChecks(record.checks, [
        "cancel",
        "downgrade",
        "duplicateWebhook",
        "dunning",
        "hostedCheckout",
        "hostedPortal",
        "invoice",
        "outOfOrderWebhook",
        "planChange",
        "refund",
        "renewal",
        "trial",
        "usage",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "ci":
      requireStatus(record, "completed");
      requireNonEmptyString(record.runUri, "runUri");
      if (!gitShaPattern.test(String(record.gitSha ?? "")))
        throw new Error("gitSha must bind the tested commit");
      if (record.gitSha !== manifest.gitSha)
        throw new Error("gitSha does not match the manifest");
      requireAllTrueChecks(record.checks, [
        "accessibility",
        "build",
        "contracts",
        "dependencyAudit",
        "e2eChromium",
        "e2eWebKit",
        "format",
        "integration",
        "lint",
        "migrations",
        "performanceBudgets",
        "productionMode",
        "security",
        "typecheck",
        "unit",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "claims":
      requireStatus(record, "reviewed");
      requireNonEmptyString(record.reviewer, "reviewer");
      if (!digestPattern.test(String(record.claimsInventoryDigest ?? "")))
        throw new Error("claimsInventoryDigest must be immutable");
      if (!claimsInventory || typeof claimsInventory !== "object")
        throw new Error(
          "claimsInventoryDigest cannot be verified without the current claims inventory",
        );
      if (record.claimsInventoryDigest !== contentDigest(claimsInventory))
        throw new Error(
          "claimsInventoryDigest does not match the current claims inventory",
        );
      requireZero(record.openPublicClaims, "openPublicClaims");
      requireAllTrueChecks(record.checks, [
        "allPublicClaimsApproved",
        "marketingMatchesImplementation",
        "prohibitedClaimsAbsent",
        "requiredDisclosuresPresent",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "deployment":
      requireStatus(record, "completed");
      requireTimestampRange(record.startedAt, record.completedAt);
      requireExactPassingStages(record.stages, [
        "api-canary",
        "api-cohort",
        "worker-canary",
        "worker-cohort",
        "web",
        "public-smoke",
        "traffic-1-percent",
        "traffic-10-percent",
        "traffic-25-percent",
        "traffic-50-percent",
        "traffic-100-percent",
      ]);
      requireAllNonEmptyStrings(record.roles, "roles");
      requireAllNonEmptyStrings(
        record.artifactCorrelation,
        "artifactCorrelation",
      );
      requireExactValues(
        record.artifactCorrelation,
        {
          apiImageDigest: manifest.imageDigests.api,
          artifactIdentityDigest: releaseArtifactIdentityDigest(manifest),
          gitSha: manifest.gitSha,
          migrationHead: manifest.database.migrationHead,
          migrationImageDigest: manifest.imageDigests.migrate,
          openapiDigest: manifest.contracts.openapiSha256,
          webImageDigest: manifest.imageDigests.web,
          workerImageDigest: manifest.imageDigests.worker,
        },
        "artifactCorrelation",
      );
      requireAllTrueChecks(record.checks, [
        "cspAndHstsPassed",
        "demoModeFalse",
        "observationWindowPassed",
        "registrationMatchesManifest",
        "serviceReleaseIdsCorrelate",
        "supportAndStatusLinksPassed",
        "tenantReadWritePassed",
        "workerExactlyOncePassed",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "incident":
      requireStatus(record, "completed");
      requireTimestampSequence(
        [
          record.startedAt,
          record.detectedAt,
          record.acknowledgedAt,
          record.containedAt,
          record.recoveredAt,
          record.closedAt,
        ],
        "incident timeline",
      );
      requireNonEmptyString(record.scenario, "scenario");
      requireNonEmptyString(record.severity, "severity");
      requireAllNonEmptyStrings(record.roles, "roles");
      requireAllTrueChecks(record.checks, [
        "authRevocationRevalidated",
        "customerImpactClassified",
        "evidencePreservedWithoutCustomerContent",
        "followUpOwnerAndDateAssigned",
        "outboxAndWorkerRecoveryRevalidated",
        "pageDeliveredToStaffedResponder",
        "smallestKillSwitchUsed",
        "statusCommunicationIssued",
        "tenantIsolationRevalidated",
      ]);
      if (typeof record.forwardFix?.required !== "boolean")
        throw new Error("forwardFix.required must be resolved");
      if (record.forwardFix.required)
        requireAllTrueChecks(
          record.forwardFix,
          [
            "noDownMigrationOrAdHocSqlUsed",
            "postFixReconciliationPassed",
            "reviewedThroughCandidatePipeline",
            "smallestAffectedWritesStayedDisabled",
          ],
          "forwardFix",
          { allowExtra: true },
        );
      requireNonEmptyArray(record.timeline, "timeline");
      requireNoFailuresAndArtifacts(record);
      return;
    case "legal":
      requireStatus(record, "reviewed");
      requireTimestamp(record.reviewedAt, "reviewedAt");
      requireAllNonEmptyStrings(record.reviewers, "reviewers");
      requireExactPassValues(record.scope, [
        "billingAndTaxResponsibilities",
        "dpa",
        "marketingClaims",
        "privacyNotice",
        "retentionAndDeletion",
        "subprocessors",
        "terms",
      ]);
      requireNonEmptyArray(
        record.approvedJurisdictions,
        "approvedJurisdictions",
      );
      requireEmptyArray(record.openFindings, "openFindings");
      requireNonEmptyString(
        record.signedOpinionReference,
        "signedOpinionReference",
      );
      requireArtifacts(record);
      return;
    case "migration":
      requireStatus(record, "completed");
      requireTimestampRange(record.startedAt, record.completedAt);
      requireAllNonEmptyStrings(
        {
          operator: record.operator,
          sourceReleaseId: record.database?.sourceReleaseId,
          sourceMigrationHead: record.database?.sourceMigrationHead,
          targetMigrationHead: record.database?.targetMigrationHead,
          backupRecoveryPoint: record.database?.backupRecoveryPoint,
        },
        "migration",
      );
      requireAllTrueChecks(
        record.database,
        ["dedicatedMigrationIdentity", "verifiedTls"],
        "database",
        { allowExtra: true },
      );
      requireExactValues(
        {
          sourceReleaseId: record.database.sourceReleaseId,
          sourceMigrationHead: record.database.sourceMigrationHead,
          targetMigrationHead: record.database.targetMigrationHead,
        },
        {
          sourceReleaseId: manifest.previousRelease.releaseId,
          sourceMigrationHead: manifest.database.previousReleaseMigrationHead,
          targetMigrationHead: manifest.database.migrationHead,
        },
        "database release identity",
      );
      requireAllTrueChecks(record.checks, [
        "currentApiReadsAndWritesNewSchema",
        "currentWorkerProcessesNewSchema",
        "failureInjectionRolledBackTransaction",
        "migrationAppliedOnce",
        "previousApiReadsNewSchema",
        "previousApplicationReadsAndWritesBeforeMigration",
        "previousWorkerProcessesNewSchema",
        "secondMigrationPassNoOp",
        "tenantAndOutboxReconciliationPassed",
        "webSmokePassed",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "performance":
      requireStatus(record, "completed");
      requireAtLeast(
        record.referenceVolume?.workspaces,
        100,
        "referenceVolume.workspaces",
      );
      requireAtLeast(
        record.referenceVolume?.workItems,
        10_000,
        "referenceVolume.workItems",
      );
      requireAtMost(record.mobileP75?.lcpMs, 2_500, "mobileP75.lcpMs");
      requireAtMost(record.mobileP75?.inpMs, 200, "mobileP75.inpMs");
      requireAtMost(record.mobileP75?.cls, 0.1, "mobileP75.cls");
      requireNonNegative(record.mobileP75?.lcpMs, "mobileP75.lcpMs");
      requireNonNegative(record.mobileP75?.inpMs, "mobileP75.inpMs");
      requireNonNegative(record.mobileP75?.cls, "mobileP75.cls");
      requireAllTrueChecks(record.checks, [
        "assetBudget",
        "paginationAndVirtualization",
        "queryBudget",
        "routeSplitting",
        "rumOperatingWindow",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "privacy":
      requireStatus(record, "completed");
      requireNonEmptyString(record.reviewReference, "reviewReference");
      requireAllTrueChecks(record.checks, [
        "accountDeletion",
        "backupLifecycleDocumented",
        "dataInventoryReviewed",
        "dsarAudit",
        "organizationExport",
        "providerRevocation",
        "retentionEnforced",
        "subprocessorsPublished",
        "userExport",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "product_metrics":
      requireStatus(record, "measured");
      requireTimestampRange(
        record.measurementWindow?.startedAt,
        record.measurementWindow?.endedAt,
      );
      requirePositive(
        record.measurementWindow?.minimumDays,
        "measurementWindow.minimumDays",
      );
      requireMinimumWindowDays(
        record.measurementWindow.startedAt,
        record.measurementWindow.endedAt,
        record.measurementWindow.minimumDays,
        "measurementWindow",
      );
      requireNonEmptyString(
        record.approvedGateReference,
        "approvedGateReference",
      );
      requireNonEmptyString(record.cohortDefinition, "cohortDefinition");
      requireAtLeast(
        record.metrics?.retainedPayingOrganizations,
        requirePositive(
          record.thresholds?.retainedPayingOrganizations,
          "thresholds.retainedPayingOrganizations",
        ),
        "metrics.retainedPayingOrganizations",
      );
      requireAtLeast(
        record.metrics?.referenceablePayingOrganizations,
        requirePositive(
          record.thresholds?.referenceablePayingOrganizations,
          "thresholds.referenceablePayingOrganizations",
        ),
        "metrics.referenceablePayingOrganizations",
      );
      requireAtLeast(
        record.metrics?.retentionRatePercent,
        requirePositive(
          record.thresholds?.retentionRatePercent,
          "thresholds.retentionRatePercent",
        ),
        "metrics.retentionRatePercent",
      );
      requireAtMost(
        record.metrics?.retentionRatePercent,
        100,
        "metrics.retentionRatePercent",
      );
      requireAtMost(
        record.thresholds?.retentionRatePercent,
        100,
        "thresholds.retentionRatePercent",
      );
      for (const key of [
        "eligibleOrganizations",
        "activatedOrganizations",
        "weeklyCoreLoopOrganizations",
      ])
        requireNonNegative(record.metrics?.[key], `metrics.${key}`);
      if (
        record.metrics.activatedOrganizations >
        record.metrics.eligibleOrganizations
      )
        throw new Error(
          "activated organizations cannot exceed the eligible cohort",
        );
      if (
        record.metrics.weeklyCoreLoopOrganizations >
        record.metrics.eligibleOrganizations
      )
        throw new Error(
          "weekly core-loop organizations cannot exceed the eligible cohort",
        );
      if (
        record.metrics.retainedPayingOrganizations >
        record.metrics.eligibleOrganizations
      )
        throw new Error(
          "retained paying organizations cannot exceed the eligible cohort",
        );
      if (
        record.metrics.referenceablePayingOrganizations >
        record.metrics.retainedPayingOrganizations
      )
        throw new Error(
          "referenceable organizations cannot exceed retained organizations",
        );
      requirePositive(
        record.metrics.eligibleOrganizations,
        "metrics.eligibleOrganizations",
      );
      requireApproximatelyEqual(
        record.metrics.retentionRatePercent,
        (record.metrics.retainedPayingOrganizations /
          record.metrics.eligibleOrganizations) *
          100,
        "metrics.retentionRatePercent",
      );
      requireNonEmptyString(record.dataSource, "dataSource");
      requireNonEmptyString(record.queryReference, "queryReference");
      requireNoFailuresAndArtifacts(record);
      return;
    case "provider_scope":
      requireStatus(record, "completed");
      if (
        !new Set(["none_enabled", "approved_limited"]).has(record.scopeDecision)
      )
        throw new Error(
          "scopeDecision must be none_enabled or approved_limited",
        );
      if (!Array.isArray(record.providers))
        throw new Error("providers must be an array");
      if (
        record.scopeDecision === "none_enabled" &&
        record.providers.length !== 0
      )
        throw new Error("none_enabled provider scope must have no providers");
      if (
        record.scopeDecision === "approved_limited" &&
        (record.providers.length < 1 || record.providers.length > 2)
      )
        throw new Error(
          "approved provider scope must contain one or two providers",
        );
      for (const provider of record.providers) {
        requireNonEmptyString(provider?.name, "providers[].name");
        requireAtLeast(
          provider?.reconciliationDays,
          7,
          "providers[].reconciliationDays",
        );
        if (provider?.result !== "PASS")
          throw new Error("every approved provider result must be PASS");
      }
      requireAllTrueChecks(record.checks, [
        "credentialsEncrypted",
        "deletionBehavior",
        "disconnectAndRevocation",
        "externalWritesRequireApproval",
        "leastScopes",
        "reconciliation",
        "replayProtection",
        "tokenRefresh",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    case "restore":
      requireStatus(record, "completed");
      requireAllNonEmptyStrings(
        {
          operator: record.operator,
          incidentObserver: record.incidentObserver,
          providerReference: record.backup?.providerReference,
        },
        "restore ownership",
      );
      requireTimestampSequence(
        [
          record.backup?.recoveryPointAt,
          record.backup?.sourceWritesFrozenAt,
          record.backup?.restoreStartedAt,
          record.backup?.serviceValidatedAt,
        ],
        "restore timeline",
      );
      requireNonNegative(record.measured?.rpoMinutes, "measured.rpoMinutes");
      requireNonNegative(record.measured?.rtoMinutes, "measured.rtoMinutes");
      requirePositive(
        record.measured?.rpoTargetMinutes,
        "measured.rpoTargetMinutes",
      );
      requirePositive(
        record.measured?.rtoTargetMinutes,
        "measured.rtoTargetMinutes",
      );
      requireAtMost(
        record.measured?.rpoMinutes,
        record.measured?.rpoTargetMinutes,
        "measured.rpoMinutes",
      );
      requireAtMost(
        record.measured?.rtoMinutes,
        record.measured?.rtoTargetMinutes,
        "measured.rtoMinutes",
      );
      requireAtMost(
        record.measured?.rpoTargetMinutes,
        15,
        "measured.rpoTargetMinutes",
      );
      requireAtMost(
        record.measured?.rtoTargetMinutes,
        240,
        "measured.rtoTargetMinutes",
      );
      const reconciliationKeys = [
        "attachmentsIfInScope",
        "auditEvents",
        "historyAndEvidence",
        "memberships",
        "messages",
        "organizations",
        "outboxByState",
        "workItems",
        "workspaces",
      ];
      if (
        JSON.stringify(Object.keys(record.reconciliation ?? {}).sort()) !==
        JSON.stringify(reconciliationKeys)
      )
        throw new Error("restore reconciliation is incomplete");
      for (const key of reconciliationKeys) {
        if (key === "attachmentsIfInScope") {
          requireNonEmptyString(
            record.reconciliation[key],
            `reconciliation.${key}`,
          );
          continue;
        }
        requireNonNegative(record.reconciliation[key], `reconciliation.${key}`);
      }
      requireAllTrueChecks(
        record.functionalChecks,
        [
          "migrationsSucceeded",
          "noExternalProviderContact",
          "organizationExportVerified",
          "portfolioLoaded",
          "tenantWriteSucceeded",
          "testIdentityAuthenticated",
          "workerProcessedExactlyOnce",
        ],
        "functionalChecks",
      );
      requireNoFailuresAndArtifacts(record);
      return;
    case "rollback":
      requireStatus(record, "completed");
      requireTimestampRange(record.startedAt, record.completedAt);
      requireAllNonEmptyStrings(record.previousRelease, "previousRelease");
      requireAllNonEmptyStrings(record.candidateRelease, "candidateRelease");
      requireExactValues(
        {
          releaseId: record.previousRelease.releaseId,
          manifestDigest: record.previousRelease.manifestDigest,
          migrationHead: record.previousRelease.migrationHead,
        },
        {
          releaseId: manifest.previousRelease.releaseId,
          manifestDigest: manifest.previousRelease.manifestDigest,
          migrationHead: manifest.database.previousReleaseMigrationHead,
        },
        "previousRelease",
      );
      requireExactValues(
        record.candidateRelease,
        {
          releaseId: manifest.releaseId,
          artifactIdentityDigest: releaseArtifactIdentityDigest(manifest),
          migrationHead: manifest.database.migrationHead,
        },
        "candidateRelease",
      );
      for (const key of [
        "apiImageDigest",
        "webImageDigest",
        "workerImageDigest",
      ])
        if (!digestPattern.test(String(record.previousRelease[key] ?? "")))
          throw new Error(`previousRelease.${key} must be immutable`);
      requireAllTrueChecks(record.checks, [
        "affectedCapabilityDisabled",
        "auditOutboxIdempotencyReconciled",
        "candidateProcessesDrained",
        "noDownMigrationOrAdHocSqlUsed",
        "postRollbackSmokePassed",
        "previousApplicationCompatibleWithCandidateSchema",
        "previousImagesRestored",
        "previousImagesRetrievedByDigest",
        "queueLeasesReconciled",
        "tenantReadWriteReconciled",
        "trafficProgressionStopped",
      ]);
      requireNonNegative(
        record.measured?.decisionToMitigationMinutes,
        "measured.decisionToMitigationMinutes",
      );
      requireNonNegative(
        record.measured?.decisionToHealthyMinutes,
        "measured.decisionToHealthyMinutes",
      );
      requireNoFailuresAndArtifacts(record);
      return;
    case "security_review":
      requireStatus(record, "completed");
      requireTimestampSequence(
        [
          record.testingStartedAt,
          record.reportIssuedAt,
          record.retest?.completedAt,
        ],
        "security review timeline",
      );
      requireNonEmptyString(
        record.reviewerOrganization,
        "reviewerOrganization",
      );
      if (record.reviewerIndependenceConfirmed !== true)
        throw new Error("reviewer independence must be confirmed");
      requireNonEmptyArray(record.scope, "scope");
      requireZero(record.findings?.criticalOpen, "findings.criticalOpen");
      requireZero(record.findings?.highOpen, "findings.highOpen");
      requireNonNegative(record.findings?.mediumOpen, "findings.mediumOpen");
      requireNonNegative(record.findings?.lowOpen, "findings.lowOpen");
      if (
        record.retest?.criticalClosed !== true ||
        record.retest?.highClosed !== true
      )
        throw new Error("critical and high findings must be closed on retest");
      if (!validEvidenceUri(record.reportReference))
        throw new Error("reportReference must be an immutable URI");
      requireDigestArtifact(
        record.artifacts,
        record.reportReference,
        "security report",
      );
      requireAcceptedSecurityRisks(record.findings, asOf);
      requireEmptyArray(record.failures, "failures");
      return;
    case "support":
      requireStatus(record, "completed");
      requireAllNonEmptyStrings(record.owners, "owners");
      requirePositive(
        record.responseTargetsMinutes?.critical,
        "responseTargetsMinutes.critical",
      );
      requirePositive(
        record.responseTargetsMinutes?.high,
        "responseTargetsMinutes.high",
      );
      requireAllTrueChecks(record.checks, [
        "changelogPublished",
        "helpPublished",
        "incidentEscalationExercised",
        "onCallStaffed",
        "securityContactPublished",
        "statusPagePublished",
        "supportChannelPublished",
      ]);
      requireNoFailuresAndArtifacts(record);
      return;
    default:
      throw new Error(`no semantic evidence policy is registered for ${kind}`);
  }
}

function requireStatus(record, expected) {
  if (record.status !== expected) throw new Error(`status must be ${expected}`);
}

function requireAllTrueChecks(
  value,
  expectedKeys,
  label = "checks",
  { allowExtra = false } = {},
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`);
  const actualKeys = (
    allowExtra
      ? Object.keys(value).filter((key) => expectedKeys.includes(key))
      : Object.keys(value)
  ).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...expectedKeys].sort()))
    throw new Error(`${label} is missing required checks`);
  if (expectedKeys.some((key) => value[key] !== true))
    throw new Error(`${label} must all be true`);
}

function requireExactPassValues(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("scope must be an object");
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...expectedKeys].sort())
  )
    throw new Error("scope must exactly match the reviewed legal areas");
  if (expectedKeys.some((key) => value[key] !== "PASS"))
    throw new Error("every legal scope result must be PASS");
}

function requireExactValues(actual, expected, label) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual))
    throw new Error(`${label} must be an object`);
  if (
    JSON.stringify(Object.keys(actual).sort()) !==
    JSON.stringify(Object.keys(expected).sort())
  )
    throw new Error(`${label} fields do not match the candidate identity`);
  for (const [key, expectedValue] of Object.entries(expected))
    if (actual[key] !== expectedValue)
      throw new Error(`${label}.${key} does not match the manifest`);
}

function requireExactStringSet(value, expected) {
  if (
    !Array.isArray(value) ||
    JSON.stringify([...value].sort()) !== JSON.stringify([...expected].sort())
  )
    throw new Error(`approvedPlanKeys must exactly be ${expected.join(", ")}`);
}

function requireExactPassingStages(value, expectedNames) {
  if (!Array.isArray(value)) throw new Error("stages must be an array");
  if (
    JSON.stringify(value.map((stage) => stage?.name).sort()) !==
    JSON.stringify([...expectedNames].sort())
  )
    throw new Error("deployment stages are incomplete");
  if (
    value.some(
      (stage) => stage.result !== "PASS" || !validEvidenceUri(stage.artifact),
    )
  )
    throw new Error("every deployment stage needs PASS and an artifact");
}

function requireAllNonEmptyStrings(value, label) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length === 0
  )
    throw new Error(`${label} must be a populated object`);
  for (const [key, entry] of Object.entries(value))
    requireNonEmptyString(entry, `${label}.${key}`);
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "")
    throw new Error(`${label} is required`);
  return value;
}

function requireNonEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error(`${label} must not be empty`);
  return value;
}

function requireEmptyArray(value, label) {
  if (!Array.isArray(value) || value.length !== 0)
    throw new Error(`${label} must be empty`);
}

function requireArtifacts(record) {
  requireNonEmptyArray(record.artifacts, "artifacts");
  for (const artifact of record.artifacts) {
    if (typeof artifact === "string" && validEvidenceUri(artifact)) continue;
    if (
      artifact &&
      typeof artifact === "object" &&
      validEvidenceUri(artifact.uri) &&
      digestPattern.test(String(artifact.sha256 ?? ""))
    )
      continue;
    throw new Error(
      "artifacts must be immutable URIs or URI/content-digest records",
    );
  }
}

function requireDigestArtifact(artifacts, expectedUri, label) {
  requireNonEmptyArray(artifacts, "artifacts");
  const artifact = artifacts.find(
    (candidate) =>
      candidate &&
      typeof candidate === "object" &&
      candidate.uri === expectedUri,
  );
  if (
    !artifact ||
    !validEvidenceUri(artifact.uri) ||
    !digestPattern.test(String(artifact.sha256 ?? ""))
  )
    throw new Error(
      `${label} must have a matching immutable URI/content-digest artifact`,
    );
  return artifact;
}

function requireAcceptedSecurityRisks(findings, asOf) {
  const acceptedRiskReferences = findings?.acceptedRiskReferences;
  if (!Array.isArray(acceptedRiskReferences))
    throw new Error("findings.acceptedRiskReferences must be an array");
  const openFindings = findings.mediumOpen + findings.lowOpen;
  if (openFindings === 0) {
    requireEmptyArray(
      acceptedRiskReferences,
      "findings.acceptedRiskReferences",
    );
    return;
  }
  requireNonEmptyArray(
    acceptedRiskReferences,
    "findings.acceptedRiskReferences",
  );
  for (const [index, reference] of acceptedRiskReferences.entries()) {
    const label = `findings.acceptedRiskReferences[${index}]`;
    if (
      !reference ||
      typeof reference !== "object" ||
      !validEvidenceUri(reference.uri) ||
      !digestPattern.test(String(reference.sha256 ?? ""))
    )
      throw new Error(
        `${label} must be an immutable URI/content-digest record`,
      );
    requireNonEmptyString(reference.ownerRole, `${label}.ownerRole`);
    const acceptedOn = requireDate(reference.acceptedOn, `${label}.acceptedOn`);
    const reviewDate = requireDate(reference.reviewDate, `${label}.reviewDate`);
    if (reviewDate < acceptedOn)
      throw new Error(`${label}.reviewDate must not precede acceptedOn`);
    if (asOf && reviewDate < asOf)
      throw new Error(`${label}.reviewDate has expired`);
  }
}

function verifyBoundArtifact(artifact, verifier, context) {
  const verified = verifier(
    { kind: context.evidenceKind, ...artifact },
    { releaseId: context.releaseId, nestedArtifact: true },
  );
  if (verified instanceof Promise)
    throw new TypeError("Artifact verification must complete synchronously.");
  if (!verified || typeof verified !== "object")
    throw new TypeError("Verifier returned no artifact content.");
  if (verified.uri !== artifact.uri)
    throw new Error("verified artifact URI does not match the evidence record");
  if (rawContentDigest(verified.content) !== artifact.sha256)
    throw new Error("verified artifact content digest does not match");
}

function requireNoFailuresAndArtifacts(record) {
  requireEmptyArray(record.failures, "failures");
  requireArtifacts(record);
}

function requireDate(value, label) {
  const parsed =
    typeof value === "string"
      ? new Date(`${value}T00:00:00.000Z`)
      : new Date(Number.NaN);
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} must be an ISO date`);
  return value;
}

function requireZero(value, label) {
  if (value !== 0) throw new Error(`${label} must equal zero`);
}

function requirePositive(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be positive`);
  return value;
}

function requireNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be non-negative`);
  return value;
}

function requireAtLeast(value, minimum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof minimum !== "number" ||
    !Number.isFinite(minimum) ||
    value < minimum
  )
    throw new Error(`${label} must be at least ${String(minimum)}`);
  return value;
}

function requireAtMost(value, maximum, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof maximum !== "number" ||
    !Number.isFinite(maximum) ||
    value > maximum
  )
    throw new Error(`${label} must be at most ${String(maximum)}`);
  return value;
}

function requireApproximatelyEqual(value, expected, label) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    typeof expected !== "number" ||
    !Number.isFinite(expected) ||
    Math.abs(value - expected) > 0.001
  )
    throw new Error(`${label} does not reconcile with source counts`);
}

function requireTimestamp(value, label) {
  if (!isTimestamp(value))
    throw new Error(`${label} must be a UTC ISO timestamp`);
  return new Date(value).valueOf();
}

function requireTimestampSequence(values, label) {
  const timestamps = values.map((value, index) =>
    requireTimestamp(value, `${label}[${index}]`),
  );
  for (let index = 1; index < timestamps.length; index += 1)
    if (timestamps[index] < timestamps[index - 1])
      throw new Error(`${label} timestamps are out of order`);
}

function requireMinimumWindowDays(startedAt, endedAt, minimumDays, label) {
  const durationDays =
    (new Date(endedAt).valueOf() - new Date(startedAt).valueOf()) / 86_400_000;
  if (durationDays < minimumDays)
    throw new Error(`${label} is shorter than its declared minimumDays`);
}

function requireTimestampRange(startedAt, endedAt) {
  if (!isTimestamp(startedAt) || !isTimestamp(endedAt))
    throw new Error("evidence window must use UTC ISO timestamps");
  if (new Date(endedAt) <= new Date(startedAt))
    throw new Error("evidence window must end after it starts");
}

function verifyProductionAuthorization(manifest, verifier, errors) {
  if (typeof verifier !== "function") {
    errors.push(
      "Production authorization requires an external completed-authorization verifier.",
    );
    return;
  }
  const expectedScopeDigest = releaseAuthorizationScopeDigest(manifest);
  try {
    const verified = verifier({
      releaseId: manifest.releaseId,
      manifestDigest: manifest.integrity?.payloadSha256,
      scopeDigest: expectedScopeDigest,
    });
    if (verified instanceof Promise)
      throw new TypeError(
        "Authorization verification must complete synchronously.",
      );
    if (!verified || typeof verified !== "object")
      throw new TypeError("Verifier returned no authorization record.");
    if (!validEvidenceUri(verified.uri))
      throw new Error("authorization record URI is not immutable HTTPS or URN");
    if (!digestPattern.test(String(verified.sha256 ?? "")))
      throw new Error("authorization record has no trusted content digest");
    if (rawContentDigest(verified.content) !== verified.sha256)
      throw new Error("authorization record content digest does not match");
    const record = parseVerifiedJsonContent(verified.content);
    if (record.schemaVersion !== 1)
      throw new Error("authorization schemaVersion must equal 1");
    if (record.template !== false)
      throw new Error("authorization must explicitly complete the template");
    if (record.status !== "authorized" || record.result !== "PASS")
      throw new Error("authorization record is not completed and passing");
    if (record.environment !== "production")
      throw new Error("authorization record is not for production");
    if (record.releaseId !== manifest.releaseId)
      throw new Error("authorization releaseId does not match the manifest");
    if (record.manifestDigest !== manifest.integrity?.payloadSha256)
      throw new Error("authorization manifest digest does not match");
    if (record.scopeDigest !== expectedScopeDigest)
      throw new Error("authorization scope digest does not match");
    for (const field of ["authorizedBy", "authorizedAt", "changeTicket"])
      if (record[field] !== manifest.authorization?.[field])
        throw new Error(`authorization ${field} does not match the manifest`);
    const confirmationKeys = Object.keys(record.approverConfirmed ?? {}).sort();
    if (
      JSON.stringify(confirmationKeys) !==
      JSON.stringify(requiredAuthorizationConfirmations)
    )
      throw new Error("authorization confirmations are incomplete");
    if (
      requiredAuthorizationConfirmations.some(
        (key) => record.approverConfirmed[key] !== true,
      )
    )
      throw new Error("authorization confirmations are not all true");
  } catch (error) {
    errors.push(
      `Production authorization record verification failed: ${error instanceof Error ? error.message : String(error)}.`,
    );
  }
}

function fileDigest(path) {
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function repositoryGitSha(repositoryRoot) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
}

function repositoryMigrationHead(repositoryRoot) {
  const journal = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "packages/db/migrations/meta/_journal.json"),
      "utf8",
    ),
  );
  const tag = journal.entries?.at(-1)?.tag;
  if (!tag) throw new Error("Migration journal has no head entry.");
  return tag;
}

function validEvidenceUri(value) {
  if (typeof value !== "string" || value.includes("REPLACE_")) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "urn:";
  } catch {
    return false;
  }
}

function isTimestamp(value) {
  if (typeof value !== "string" || !value.endsWith("Z")) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
}

function sortObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!new Set(["generate", "validate", "authorize"]).has(command))
    throw new Error(
      "Usage: phase6-release-manifest.mjs <generate|validate|authorize> --input/--manifest path [--output path]",
    );
  const repositoryRoot = resolve(
    option(args, "--repo-root", defaultRepositoryRoot),
  );
  if (command === "generate") {
    const inputPath = resolve(repositoryRoot, option(args, "--input"));
    const outputPath = resolve(repositoryRoot, option(args, "--output"));
    const manifest = createReleaseManifest(
      JSON.parse(readFileSync(inputPath, "utf8")),
      {
        repositoryRoot,
      },
    );
    const errors = validateReleaseManifest(manifest, { repositoryRoot });
    if (errors.length) throw new Error(errors.join("\n"));
    writeImmutableManifest(outputPath, manifest);
    console.log(`${outputPath}\n${manifest.integrity.payloadSha256}`);
    return;
  }
  const manifestPath = resolve(repositoryRoot, option(args, "--manifest"));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const forProduction = command === "authorize";
  const readinessRegister = forProduction
    ? JSON.parse(
        readFileSync(
          resolve(repositoryRoot, "release/phase6-readiness.json"),
          "utf8",
        ),
      )
    : undefined;
  const claimsInventory = forProduction
    ? JSON.parse(
        readFileSync(
          resolve(repositoryRoot, "release/marketing-claims.json"),
          "utf8",
        ),
      )
    : undefined;
  const errors = validateReleaseManifest(manifest, {
    forProduction,
    repositoryRoot,
    readinessRegister,
    claimsInventory,
    asOf: option(args, "--as-of", new Date().toISOString().slice(0, 10)),
  });
  if (errors.length) {
    console.error(
      `${forProduction ? "NO_GO" : "INVALID"}\n${errors.map((error) => `- ${error}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(forProduction ? "AUTHORIZED" : "VALID");
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
