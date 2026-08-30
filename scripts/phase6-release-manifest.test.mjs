import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import {
  createReleaseManifest,
  evidenceTemplateFiles,
  releaseArtifactIdentityDigest,
  releaseAuthorizationScopeDigest,
  repositoryWorktreeChanges,
  requiredEvidenceKinds,
  stableStringify,
  validateReleaseManifest,
  writeImmutableManifest,
} from "./phase6-release-manifest.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const digest = (character) => `sha256:${character.repeat(64)}`;
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const migrationHead = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "packages/db/migrations/meta/_journal.json"),
    "utf8",
  ),
).entries.at(-1).tag;
const currentClaimsInventory = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "release/marketing-claims.json"),
    "utf8",
  ),
);
const cleanRepository = { repositoryRoot, worktreeStatus: "" };
const rawDigest = (content) =>
  `sha256:${createHash("sha256").update(content).digest("hex")}`;

function candidateInput() {
  return {
    schemaVersion: 1,
    releaseId: "trevv-2026.08.30-rc.1",
    createdAt: "2026-08-30T12:00:00.000Z",
    gitSha,
    imageDigests: {
      web: digest("1"),
      api: digest("2"),
      worker: digest("3"),
      migrate: digest("4"),
    },
    database: {
      previousReleaseMigrationHead: "0015_silky_sharon_ventura",
      strategy: "additive-forward-only",
    },
    runtimes: { node: "22.19.0", pnpm: "11.22.0" },
    securityModes: {
      demoMode: false,
      registrationMode: "closed",
      cspMode: "enforce",
      hstsEnabled: true,
      rateLimitBackend: "postgres",
      errorReportingMode: "external",
    },
    previousRelease: {
      releaseId: "trevv-2026.08.29-rc.1",
      manifestDigest: digest("5"),
    },
    evidenceLinks: requiredEvidenceKinds.map((kind) => ({
      kind,
      uri: `https://evidence.invalid/trevv-2026.08.30-rc.1/${kind}`,
      sha256: digest("7"),
    })),
    authorization: {
      status: "not_authorized",
      environment: "production",
      authorizedBy: null,
      authorizedAt: null,
      changeTicket: null,
      scopeDigest: null,
    },
  };
}

function evidenceBackedInput({ firstReleaseId } = {}) {
  const input = candidateInput();
  const artifactManifest = createReleaseManifest(input, cleanRepository);
  const records = new Map();
  input.evidenceLinks = input.evidenceLinks.map((link, index) => {
    const record = passingEvidenceRecord(
      link.kind,
      input.releaseId,
      artifactManifest,
    );
    if (index === 0 && firstReleaseId) record.releaseId = firstReleaseId;
    if (link.kind === "security_review") {
      const reportContent = "Independent security report fixture";
      record.artifacts = [
        {
          uri: record.reportReference,
          sha256: rawDigest(reportContent),
        },
      ];
      records.set(record.reportReference, reportContent);
    }
    const content = JSON.stringify(record);
    records.set(link.uri, content);
    return { ...link, sha256: rawDigest(content) };
  });
  return { input, records };
}

function passingEvidenceRecord(kind, releaseId, manifest) {
  const record = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "release/evidence", evidenceTemplateFiles[kind]),
      "utf8",
    ),
  );
  record.template = false;
  record.releaseId = releaseId;
  record.result = "PASS";
  if (Array.isArray(record.artifacts))
    record.artifacts = [`urn:trevv:evidence:${kind}:artifact`];
  if (Array.isArray(record.failures)) record.failures = [];
  setChecksPassing(record.checks);

  switch (kind) {
    case "accessibility":
      record.status = "completed";
      record.criticalPathCount = 5;
      record.unreviewedFindings = 0;
      break;
    case "availability":
      record.status = "measured";
      Object.assign(record.window, {
        startedAt: "2026-07-01T00:00:00.000Z",
        endedAt: "2026-08-01T00:00:00.000Z",
        minimumDays: 30,
        customerMinutes: 44_640,
        unavailableMinutes: 0,
        excludedMaintenanceMinutes: 0,
        measuredAvailabilityPercent: 100,
        targetAvailabilityPercent: 99.9,
      });
      Object.assign(record.measurement, {
        collector: "urn:trevv:collector:production",
        query: "urn:trevv:query:availability",
        syntheticChecks: ["urn:trevv:synthetic:public"],
        errorBudgetPolicy: "urn:trevv:policy:error-budget",
        staffedResponseSchedule: "urn:trevv:on-call:schedule",
      });
      break;
    case "billing":
      record.status = "completed";
      record.approvedPricingReference = "urn:trevv:pricing:approved";
      record.approvedPlanKeys = ["founder", "startup"];
      break;
    case "ci":
      record.status = "completed";
      record.runUri = "urn:trevv:ci:run";
      record.gitSha = gitSha;
      break;
    case "claims":
      record.status = "reviewed";
      record.reviewer = "Product and Legal";
      record.claimsInventoryDigest = rawDigest(
        stableStringify(currentClaimsInventory),
      );
      record.openPublicClaims = 0;
      break;
    case "deployment":
      record.status = "completed";
      record.startedAt = "2026-08-29T00:00:00.000Z";
      record.completedAt = "2026-08-29T01:00:00.000Z";
      setStrings(record.roles, "verified-owner");
      Object.assign(record.artifactCorrelation, {
        artifactIdentityDigest: releaseArtifactIdentityDigest(manifest),
        gitSha: manifest.gitSha,
        webImageDigest: manifest.imageDigests.web,
        apiImageDigest: manifest.imageDigests.api,
        workerImageDigest: manifest.imageDigests.worker,
        migrationImageDigest: manifest.imageDigests.migrate,
        migrationHead: manifest.database.migrationHead,
        openapiDigest: manifest.contracts.openapiSha256,
      });
      record.stages = record.stages.map((stage) => ({
        ...stage,
        result: "PASS",
        artifact: `urn:trevv:deployment:${stage.name}`,
      }));
      break;
    case "incident":
      record.status = "completed";
      record.scenario = "Production dependency failure";
      record.severity = "SEV-1";
      Object.assign(record, {
        startedAt: "2026-08-29T00:00:00.000Z",
        detectedAt: "2026-08-29T00:01:00.000Z",
        acknowledgedAt: "2026-08-29T00:02:00.000Z",
        containedAt: "2026-08-29T00:10:00.000Z",
        recoveredAt: "2026-08-29T00:20:00.000Z",
        closedAt: "2026-08-29T01:00:00.000Z",
      });
      setStrings(record.roles, "verified-owner");
      record.forwardFix.required = false;
      record.timeline = [
        {
          at: "2026-08-29T00:00:00.000Z",
          event: "Exercise detected and handled",
        },
      ];
      break;
    case "legal":
      record.status = "reviewed";
      record.reviewedAt = "2026-08-29T00:00:00.000Z";
      setStrings(record.reviewers, "qualified-reviewer");
      for (const key of Object.keys(record.scope)) record.scope[key] = "PASS";
      record.approvedJurisdictions = ["DE"];
      record.openFindings = [];
      record.signedOpinionReference = "urn:trevv:legal:opinion";
      break;
    case "migration":
      record.status = "completed";
      record.startedAt = "2026-08-29T00:00:00.000Z";
      record.completedAt = "2026-08-29T00:30:00.000Z";
      record.operator = "Release operator";
      Object.assign(record.database, {
        sourceReleaseId: manifest.previousRelease.releaseId,
        sourceMigrationHead: manifest.database.previousReleaseMigrationHead,
        targetMigrationHead: manifest.database.migrationHead,
        backupRecoveryPoint: "urn:trevv:backup:point",
        dedicatedMigrationIdentity: true,
        verifiedTls: true,
      });
      break;
    case "performance":
      record.status = "completed";
      Object.assign(record.referenceVolume, {
        workspaces: 100,
        workItems: 10_000,
      });
      Object.assign(record.mobileP75, { lcpMs: 2_000, inpMs: 150, cls: 0.05 });
      break;
    case "privacy":
      record.status = "completed";
      record.reviewReference = "urn:trevv:privacy:review";
      break;
    case "product_metrics":
      record.status = "measured";
      Object.assign(record.measurementWindow, {
        startedAt: "2026-07-01T00:00:00.000Z",
        endedAt: "2026-08-01T00:00:00.000Z",
        minimumDays: 30,
      });
      record.approvedGateReference = "urn:trevv:metrics:gates";
      record.cohortDefinition = "Paying private-beta organizations";
      Object.assign(record.metrics, {
        eligibleOrganizations: 10,
        activatedOrganizations: 10,
        retainedPayingOrganizations: 8,
        referenceablePayingOrganizations: 3,
        weeklyCoreLoopOrganizations: 8,
        retentionRatePercent: 80,
      });
      Object.assign(record.thresholds, {
        retainedPayingOrganizations: 5,
        referenceablePayingOrganizations: 2,
        retentionRatePercent: 70,
      });
      record.dataSource = "urn:trevv:metrics:source";
      record.queryReference = "urn:trevv:metrics:query";
      break;
    case "provider_scope":
      record.status = "completed";
      record.scopeDecision = "none_enabled";
      record.providers = [];
      break;
    case "restore":
      record.status = "completed";
      record.operator = "Restore operator";
      record.incidentObserver = "Incident observer";
      Object.assign(record.backup, {
        providerReference: "urn:trevv:backup:restore-point",
        recoveryPointAt: "2026-08-29T00:00:00.000Z",
        sourceWritesFrozenAt: "2026-08-29T00:05:00.000Z",
        restoreStartedAt: "2026-08-29T00:10:00.000Z",
        serviceValidatedAt: "2026-08-29T03:00:00.000Z",
      });
      Object.assign(record.measured, {
        rpoMinutes: 10,
        rtoMinutes: 180,
        rpoTargetMinutes: 15,
        rtoTargetMinutes: 240,
      });
      for (const key of Object.keys(record.reconciliation))
        if (key !== "attachmentsIfInScope") record.reconciliation[key] = 1;
      setChecksPassing(record.functionalChecks);
      break;
    case "rollback":
      record.status = "completed";
      record.startedAt = "2026-08-29T00:00:00.000Z";
      record.completedAt = "2026-08-29T00:20:00.000Z";
      Object.assign(record.previousRelease, {
        releaseId: manifest.previousRelease.releaseId,
        manifestDigest: manifest.previousRelease.manifestDigest,
        webImageDigest: digest("b"),
        apiImageDigest: digest("c"),
        workerImageDigest: digest("d"),
        migrationHead: manifest.database.previousReleaseMigrationHead,
      });
      Object.assign(record.candidateRelease, {
        releaseId: manifest.releaseId,
        artifactIdentityDigest: releaseArtifactIdentityDigest(manifest),
        migrationHead: manifest.database.migrationHead,
      });
      Object.assign(record.measured, {
        decisionToMitigationMinutes: 5,
        decisionToHealthyMinutes: 20,
      });
      break;
    case "security_review":
      record.status = "completed";
      record.reviewerOrganization = "Independent Security Review";
      record.reviewerIndependenceConfirmed = true;
      record.scope = ["Web", "API", "Worker", "PostgreSQL"];
      record.testingStartedAt = "2026-08-20T00:00:00.000Z";
      record.reportIssuedAt = "2026-08-25T00:00:00.000Z";
      Object.assign(record.findings, {
        criticalOpen: 0,
        highOpen: 0,
        mediumOpen: 0,
        lowOpen: 0,
      });
      Object.assign(record.retest, {
        completedAt: "2026-08-29T00:00:00.000Z",
        criticalClosed: true,
        highClosed: true,
      });
      record.reportReference = "urn:trevv:security:report";
      break;
    case "support":
      record.status = "completed";
      setStrings(record.owners, "verified-owner");
      Object.assign(record.responseTargetsMinutes, { critical: 15, high: 60 });
      break;
    default:
      throw new Error(`Missing passing evidence fixture for ${kind}`);
  }
  return record;
}

function setChecksPassing(checks) {
  if (!checks) return;
  for (const key of Object.keys(checks)) checks[key] = true;
}

function setStrings(value, replacement) {
  for (const key of Object.keys(value)) value[key] = replacement;
}

function authorizedManifestFixture() {
  const { input, records } = evidenceBackedInput();
  const candidate = createReleaseManifest(input, cleanRepository);
  input.authorization = {
    status: "authorized",
    environment: "production",
    authorizedBy: "release-approver@example.invalid",
    authorizedAt: "2026-08-30T12:30:00.000Z",
    changeTicket: "CHG-2026-0001",
    scopeDigest: releaseAuthorizationScopeDigest(candidate),
  };
  const manifest = createReleaseManifest(input, cleanRepository);
  const authorizationRecord = {
    schemaVersion: 1,
    template: false,
    status: "authorized",
    result: "PASS",
    environment: "production",
    releaseId: manifest.releaseId,
    manifestDigest: manifest.integrity.payloadSha256,
    scopeDigest: releaseAuthorizationScopeDigest(manifest),
    authorizedBy: manifest.authorization.authorizedBy,
    authorizedAt: manifest.authorization.authorizedAt,
    changeTicket: manifest.authorization.changeTicket,
    approverConfirmed: {
      sameArtifactsAsStaging: true,
      readinessRegisterGo: true,
      claimsRegisterGo: true,
      evidenceContentAndReleaseIdsVerified: true,
      backupAndRestoreEvidenceReviewed: true,
      migrationAndRollbackEvidenceReviewed: true,
      securityAndLegalEvidenceReviewed: true,
      supportAndIncidentEvidenceReviewed: true,
      commercialEvidenceReviewed: true,
      productMetricsGatePassed: true,
    },
  };
  return { manifest, records, authorizationRecord };
}

function evidenceMutationErrors(kind, mutate) {
  const fixture = evidenceBackedInput();
  const link = fixture.input.evidenceLinks.find((entry) => entry.kind === kind);
  const record = JSON.parse(fixture.records.get(link.uri));
  mutate(record);
  const content = JSON.stringify(record);
  link.sha256 = rawDigest(content);
  fixture.records.set(link.uri, content);
  const manifest = createReleaseManifest(fixture.input, cleanRepository);
  return validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    claimsInventory: currentClaimsInventory,
    evidenceVerifier: (entry) => ({
      uri: entry.uri,
      content: fixture.records.get(entry.uri),
    }),
  });
}

test("generates a repository-correlated immutable candidate manifest", () => {
  const manifest = createReleaseManifest(candidateInput(), cleanRepository);
  assert.equal(manifest.gitSha, gitSha);
  assert.equal(manifest.database.migrationHead, migrationHead);
  assert.match(manifest.contracts.openapiSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(validateReleaseManifest(manifest, { repositoryRoot }), []);
});

test("writes a manifest once with read-only permissions", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "trevv-phase6-manifest-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "release-manifest.json");
  const manifest = createReleaseManifest(candidateInput(), cleanRepository);

  writeImmutableManifest(path, manifest);

  assert.equal(readFileSync(path, "utf8"), `${stableStringify(manifest)}\n`);
  assert.equal(statSync(path).mode & 0o777, 0o444);
  assert.throws(
    () => writeImmutableManifest(path, manifest),
    (error) => error?.code === "EEXIST",
  );
});

test("tampering invalidates the canonical payload digest", () => {
  const manifest = createReleaseManifest(candidateInput(), cleanRepository);
  manifest.securityModes.demoMode = true;
  const errors = validateReleaseManifest(manifest, { repositoryRoot });
  assert.ok(errors.includes("securityModes.demoMode must be false."));
  assert.ok(
    errors.includes(
      "integrity.payloadSha256 does not match the canonical manifest payload.",
    ),
  );
});

test("authorization scope is derived from immutable release inputs", () => {
  const manifest = createReleaseManifest(candidateInput(), cleanRepository);
  const original = releaseAuthorizationScopeDigest(manifest);
  const mutableAuthorizationChange = structuredClone(manifest);
  mutableAuthorizationChange.authorization.authorizedBy =
    "another-approver@example.invalid";
  assert.equal(
    releaseAuthorizationScopeDigest(mutableAuthorizationChange),
    original,
  );

  const changedArtifact = structuredClone(manifest);
  changedArtifact.imageDigests.web = digest("9");
  assert.notEqual(releaseAuthorizationScopeDigest(changedArtifact), original);

  const wrongScope = candidateInput();
  wrongScope.authorization = {
    status: "authorized",
    environment: "production",
    authorizedBy: "release-approver@example.invalid",
    authorizedAt: "2026-08-30T12:30:00.000Z",
    changeTicket: "CHG-2026-0001",
    scopeDigest: digest("6"),
  };
  const wrongManifest = createReleaseManifest(wrongScope, cleanRepository);
  assert.ok(
    validateReleaseManifest(wrongManifest, { repositoryRoot }).includes(
      "authorization.scopeDigest does not match the canonical release scope.",
    ),
  );
});

test("requires a content digest for every evidence link", () => {
  const input = candidateInput();
  delete input.evidenceLinks[0].sha256;
  const manifest = createReleaseManifest(input, cleanRepository);
  assert.ok(
    validateReleaseManifest(manifest, { repositoryRoot }).includes(
      "evidenceLinks[0].sha256 must bind the referenced evidence content.",
    ),
  );
});

test("production authorization requires legal and product-metrics evidence", () => {
  assert.ok(requiredEvidenceKinds.includes("legal"));
  assert.ok(requiredEvidenceKinds.includes("product_metrics"));

  const input = candidateInput();
  input.evidenceLinks = input.evidenceLinks.filter(
    ({ kind }) => kind !== "legal" && kind !== "product_metrics",
  );
  const manifest = createReleaseManifest(input, cleanRepository);
  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
  });

  assert.ok(
    errors.includes("Production authorization requires legal evidence."),
  );
  assert.ok(
    errors.includes(
      "Production authorization requires product_metrics evidence.",
    ),
  );
});

test("the release input and evidence templates keep new gates unverified", () => {
  const template = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "release/release-manifest-input.template.json"),
      "utf8",
    ),
  );
  const templateKinds = template.evidenceLinks.map(({ kind }) => kind).sort();
  assert.deepEqual(templateKinds, [...requiredEvidenceKinds].sort());

  for (const [kind, fileName] of Object.entries(evidenceTemplateFiles)) {
    const evidence = JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "release/evidence", fileName),
        "utf8",
      ),
    );
    assert.equal(evidence.schemaVersion, 1);
    assert.equal(evidence.evidenceKind, kind);
    assert.equal(evidence.template, true);
    assert.equal(evidence.result, "UNVERIFIED");
  }

  const authorizationTemplate = JSON.parse(
    readFileSync(
      resolve(
        repositoryRoot,
        "release/evidence/release-authorization.template.json",
      ),
      "utf8",
    ),
  );
  assert.equal(authorizationTemplate.template, true);
  assert.equal(authorizationTemplate.result, "UNVERIFIED");
  assert.ok(
    Object.values(authorizationTemplate.approverConfirmed).every(
      (value) => value === false,
    ),
  );
});

test("production verification hashes evidence and binds every release id", () => {
  const { manifest, records, authorizationRecord } =
    authorizedManifestFixture();
  const authorizationContent = JSON.stringify(authorizationRecord);
  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    claimsInventory: currentClaimsInventory,
    evidenceVerifier: (link) => ({
      uri: link.uri,
      content: records.get(link.uri),
    }),
    authorizationVerifier: () => ({
      uri: "urn:trevv:authorization:trevv-2026.08.30-rc.1",
      sha256: rawDigest(authorizationContent),
      content: authorizationContent,
    }),
  });

  assert.ok(
    !errors.some((error) => error.startsWith("Evidence ")),
    errors.join("\n"),
  );
  assert.ok(
    !errors.some((error) =>
      error.startsWith("Production authorization record verification failed"),
    ),
    errors.join("\n"),
  );
  assert.ok(
    !errors.includes(
      "Production authorization requires an external evidence-content verifier.",
    ),
  );
  assert.ok(
    !errors.includes(
      "Production authorization requires an external completed-authorization verifier.",
    ),
  );
});

test("minimal and wrong-kind PASS records cannot satisfy evidence gates", () => {
  const minimal = evidenceBackedInput();
  const firstMinimalLink = minimal.input.evidenceLinks[0];
  const minimalContent = JSON.stringify({
    schemaVersion: 1,
    evidenceKind: firstMinimalLink.kind,
    template: false,
    status: "completed",
    releaseId: minimal.input.releaseId,
    result: "PASS",
  });
  firstMinimalLink.sha256 = rawDigest(minimalContent);
  minimal.records.set(firstMinimalLink.uri, minimalContent);
  const minimalManifest = createReleaseManifest(minimal.input, cleanRepository);
  const minimalErrors = validateReleaseManifest(minimalManifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: (link) => ({
      uri: link.uri,
      content: minimal.records.get(link.uri),
    }),
  });
  assert.ok(
    minimalErrors.some(
      (error) =>
        error.startsWith("Evidence accessibility verification failed:") &&
        error.includes("checks must be an object"),
    ),
    minimalErrors.join("\n"),
  );

  const wrongKind = evidenceBackedInput();
  const firstWrongKindLink = wrongKind.input.evidenceLinks[0];
  const wrongKindRecord = JSON.parse(
    wrongKind.records.get(firstWrongKindLink.uri),
  );
  wrongKindRecord.evidenceKind = "billing";
  const wrongKindContent = JSON.stringify(wrongKindRecord);
  firstWrongKindLink.sha256 = rawDigest(wrongKindContent);
  wrongKind.records.set(firstWrongKindLink.uri, wrongKindContent);
  const wrongKindManifest = createReleaseManifest(
    wrongKind.input,
    cleanRepository,
  );
  const wrongKindErrors = validateReleaseManifest(wrongKindManifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: (link) => ({
      uri: link.uri,
      content: wrongKind.records.get(link.uri),
    }),
  });
  assert.ok(
    wrongKindErrors.includes(
      "Evidence accessibility verification failed: evidenceKind does not match the manifest link.",
    ),
  );
});

test("candidate identity, chronology, and derived evidence must reconcile", () => {
  const cases = [
    {
      kind: "ci",
      mutate: (record) => {
        record.gitSha = "f".repeat(40);
      },
      message: "gitSha does not match the manifest",
    },
    {
      kind: "deployment",
      mutate: (record) => {
        record.artifactCorrelation.webImageDigest = digest("9");
      },
      message: "artifactCorrelation.webImageDigest does not match the manifest",
    },
    {
      kind: "migration",
      mutate: (record) => {
        record.database.targetMigrationHead = "9999_wrong_candidate";
      },
      message:
        "database release identity.targetMigrationHead does not match the manifest",
    },
    {
      kind: "rollback",
      mutate: (record) => {
        record.candidateRelease.releaseId = "trevv-2026.08.31-rc.1";
      },
      message: "candidateRelease.releaseId does not match the manifest",
    },
    {
      kind: "availability",
      mutate: (record) => {
        record.window.unavailableMinutes = 60;
      },
      message:
        "window.measuredAvailabilityPercent does not reconcile with source counts",
    },
    {
      kind: "product_metrics",
      mutate: (record) => {
        record.metrics.retentionRatePercent = 95;
      },
      message:
        "metrics.retentionRatePercent does not reconcile with source counts",
    },
    {
      kind: "deployment",
      mutate: (record) => {
        record.completedAt = "2026-08-28T23:00:00.000Z";
      },
      message: "evidence window must end after it starts",
    },
    {
      kind: "claims",
      mutate: (record) => {
        record.claimsInventoryDigest = digest("f");
      },
      message:
        "claimsInventoryDigest does not match the current claims inventory",
    },
    {
      kind: "security_review",
      mutate: (record) => {
        record.reportReference = "mutable-report-reference";
      },
      message: "reportReference must be an immutable URI",
    },
    {
      kind: "security_review",
      mutate: (record) => {
        record.artifacts = [record.reportReference];
      },
      message:
        "security report must have a matching immutable URI/content-digest artifact",
    },
    {
      kind: "security_review",
      mutate: (record) => {
        record.findings.mediumOpen = 1;
      },
      message: "findings.acceptedRiskReferences must not be empty",
    },
    {
      kind: "security_review",
      mutate: (record) => {
        record.findings.lowOpen = 1;
        record.findings.acceptedRiskReferences = [
          {
            uri: "urn:trevv:security:risk-acceptance:1",
            sha256: digest("e"),
            acceptedOn: "2026-08-29",
            reviewDate: "2026-09-30",
          },
        ];
      },
      message: "findings.acceptedRiskReferences[0].ownerRole is required",
    },
  ];

  for (const { kind, mutate, message } of cases) {
    const errors = evidenceMutationErrors(kind, mutate);
    assert.ok(
      errors.some(
        (error) =>
          error.startsWith(`Evidence ${kind} verification failed:`) &&
          error.includes(message),
      ),
      `${kind}: ${errors.join("\n")}`,
    );
  }
});

test("evidence digest and release mismatches fail closed", () => {
  const valid = authorizedManifestFixture();
  const digestErrors = validateReleaseManifest(valid.manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: (link) => ({
      uri: link.uri,
      content: `${valid.records.get(link.uri)}\n`,
    }),
  });
  assert.ok(
    digestErrors.some((error) =>
      error.includes("verified content digest does not match the manifest"),
    ),
  );

  const wrongRelease = evidenceBackedInput({
    firstReleaseId: "trevv-2026.08.29-rc.1",
  });
  const wrongReleaseManifest = createReleaseManifest(
    wrongRelease.input,
    cleanRepository,
  );
  const releaseErrors = validateReleaseManifest(wrongReleaseManifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: (link) => ({
      uri: link.uri,
      content: wrongRelease.records.get(link.uri),
    }),
  });
  assert.ok(
    releaseErrors.some((error) =>
      error.includes("evidence releaseId does not match the manifest"),
    ),
  );
});

test("authorization verification binds manifest, scope, and confirmations", () => {
  const { manifest, authorizationRecord } = authorizedManifestFixture();
  authorizationRecord.approverConfirmed.productMetricsGatePassed = false;
  const authorizationContent = JSON.stringify(authorizationRecord);
  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: () => {
      throw new Error("not relevant to authorization assertion");
    },
    authorizationVerifier: () => ({
      uri: "urn:trevv:authorization:trevv-2026.08.30-rc.1",
      sha256: rawDigest(authorizationContent),
      content: authorizationContent,
    }),
  });
  assert.ok(
    errors.includes(
      "Production authorization record verification failed: authorization confirmations are not all true.",
    ),
  );

  authorizationRecord.approverConfirmed.productMetricsGatePassed = true;
  authorizationRecord.manifestDigest = digest("8");
  const wrongManifestContent = JSON.stringify(authorizationRecord);
  const wrongManifestErrors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    evidenceVerifier: () => {
      throw new Error("not relevant to authorization assertion");
    },
    authorizationVerifier: () => ({
      uri: "urn:trevv:authorization:trevv-2026.08.30-rc.1",
      sha256: rawDigest(wrongManifestContent),
      content: wrongManifestContent,
    }),
  });
  assert.ok(
    wrongManifestErrors.includes(
      "Production authorization record verification failed: authorization manifest digest does not match.",
    ),
  );

  const noVerifierErrors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
  });
  assert.ok(
    noVerifierErrors.includes(
      "Production authorization requires an external evidence-content verifier.",
    ),
  );
  assert.ok(
    noVerifierErrors.includes(
      "Production authorization requires an external completed-authorization verifier.",
    ),
  );
});

test("authorization records must explicitly complete the current schema", () => {
  for (const { mutate, message } of [
    {
      mutate: (record) => delete record.schemaVersion,
      message: "authorization schemaVersion must equal 1",
    },
    {
      mutate: (record) => {
        record.schemaVersion = 2;
      },
      message: "authorization schemaVersion must equal 1",
    },
    {
      mutate: (record) => delete record.template,
      message: "authorization must explicitly complete the template",
    },
    {
      mutate: (record) => {
        record.template = true;
      },
      message: "authorization must explicitly complete the template",
    },
  ]) {
    const { manifest, authorizationRecord } = authorizedManifestFixture();
    mutate(authorizationRecord);
    const content = JSON.stringify(authorizationRecord);
    const errors = validateReleaseManifest(manifest, {
      forProduction: true,
      repositoryRoot,
      worktreeStatus: "",
      claimsInventory: currentClaimsInventory,
      evidenceVerifier: () => {
        throw new Error("not relevant to authorization assertion");
      },
      authorizationVerifier: () => ({
        uri: "urn:trevv:authorization:trevv-2026.08.30-rc.1",
        sha256: rawDigest(content),
        content,
      }),
    });
    assert.ok(
      errors.includes(
        `Production authorization record verification failed: ${message}.`,
      ),
      errors.join("\n"),
    );
  }
});

test("the independent security report content is externally verified", () => {
  const fixture = evidenceBackedInput();
  const manifest = createReleaseManifest(fixture.input, cleanRepository);
  const securityLink = fixture.input.evidenceLinks.find(
    ({ kind }) => kind === "security_review",
  );
  const securityRecord = JSON.parse(fixture.records.get(securityLink.uri));
  fixture.records.set(
    securityRecord.reportReference,
    `${fixture.records.get(securityRecord.reportReference)} tampered`,
  );

  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "",
    claimsInventory: currentClaimsInventory,
    evidenceVerifier: (entry) => ({
      uri: entry.uri,
      content: fixture.records.get(entry.uri),
    }),
  });
  assert.ok(
    errors.includes(
      "Evidence security_review verification failed: verified artifact content digest does not match.",
    ),
    errors.join("\n"),
  );
});

test("the repository CLI cannot authorize without external verifiers", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "trevv-phase6-authorize-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "release-manifest.json");
  const { manifest } = authorizedManifestFixture();
  writeFileSync(path, `${JSON.stringify(manifest)}\n`, "utf8");

  const result = spawnSync(
    process.execPath,
    [
      "scripts/phase6-release-manifest.mjs",
      "authorize",
      "--manifest",
      path,
      "--repo-root",
      repositoryRoot,
      "--as-of",
      "2026-08-30",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /Production authorization requires an external evidence-content verifier/u,
  );
  assert.match(
    result.stderr,
    /Production authorization requires an external completed-authorization verifier/u,
  );
});

test("manifest generation and production validation reject dirty build inputs", () => {
  const dirtyStatus = [
    " M apps/web/app/layout.tsx",
    "?? apps/web/app/new-release-input.tsx",
  ].join("\0");
  assert.deepEqual(
    repositoryWorktreeChanges(repositoryRoot, { statusOutput: dirtyStatus }),
    [" M apps/web/app/layout.tsx", "?? apps/web/app/new-release-input.tsx"],
  );
  assert.throws(
    () =>
      createReleaseManifest(candidateInput(), {
        repositoryRoot,
        worktreeStatus: dirtyStatus,
      }),
    /dirty Git worktree; found 2 tracked or untracked change\(s\)/u,
  );

  const manifest = createReleaseManifest(candidateInput(), cleanRepository);
  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    worktreeStatus: "?? apps/web/app/untracked-build-input.tsx\0",
  });
  assert.ok(
    errors.includes(
      "Production authorization requires a clean Git worktree; found 1 tracked or untracked change(s).",
    ),
  );
});

test("registration schema supports invite-only but forbids public production admission", () => {
  const legacyInput = candidateInput();
  delete legacyInput.securityModes.registrationMode;
  legacyInput.securityModes.signupMode = "invite_only";
  const legacyManifest = createReleaseManifest(legacyInput, cleanRepository);
  assert.ok(
    validateReleaseManifest(legacyManifest, { repositoryRoot }).includes(
      "securityModes.registrationMode is invalid.",
    ),
  );

  const publicInput = candidateInput();
  publicInput.securityModes.registrationMode = "public";
  const publicManifest = createReleaseManifest(publicInput, cleanRepository);
  const errors = validateReleaseManifest(publicManifest, {
    forProduction: true,
    repositoryRoot,
    readinessRegister: JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "release/phase6-readiness.json"),
        "utf8",
      ),
    ),
    claimsInventory: JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "release/marketing-claims.json"),
        "utf8",
      ),
    ),
    asOf: "2026-08-30",
  });
  assert.ok(
    errors.includes(
      "Production authorization requires closed or invite_only registration.",
    ),
  );

  const inviteOnlyInput = candidateInput();
  inviteOnlyInput.securityModes.registrationMode = "invite_only";
  const inviteOnlyManifest = createReleaseManifest(
    inviteOnlyInput,
    cleanRepository,
  );
  const inviteOnlyErrors = validateReleaseManifest(inviteOnlyManifest, {
    forProduction: true,
    repositoryRoot,
    readinessRegister: JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "release/phase6-readiness.json"),
        "utf8",
      ),
    ),
    claimsInventory: JSON.parse(
      readFileSync(
        resolve(repositoryRoot, "release/marketing-claims.json"),
        "utf8",
      ),
    ),
    asOf: "2026-08-30",
  });
  assert.ok(
    !inviteOnlyErrors.includes(
      "Production authorization requires closed or invite_only registration.",
    ),
  );
});

test("the current NO_GO registers prevent production authorization", () => {
  const input = candidateInput();
  input.authorization = {
    status: "authorized",
    environment: "production",
    authorizedBy: "release-approver@example.invalid",
    authorizedAt: "2026-08-30T12:30:00.000Z",
    changeTicket: "CHG-2026-0001",
    scopeDigest: digest("6"),
  };
  const manifest = createReleaseManifest(input, cleanRepository);
  const readinessRegister = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "release/phase6-readiness.json"),
      "utf8",
    ),
  );
  const claimsInventory = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "release/marketing-claims.json"),
      "utf8",
    ),
  );
  const errors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot,
    readinessRegister,
    claimsInventory,
    asOf: "2026-08-30",
  });
  assert.ok(errors.some((error) => error.includes("P0-05 is open")));
  assert.ok(errors.some((error) => error.includes("CLAIM-008 is prohibited")));
});

test("an unfilled input template cannot generate a manifest", () => {
  const template = JSON.parse(
    readFileSync(
      resolve(repositoryRoot, "release/release-manifest-input.template.json"),
      "utf8",
    ),
  );
  assert.throws(
    () => createReleaseManifest(template, { repositoryRoot }),
    /unfilled template/u,
  );
});
