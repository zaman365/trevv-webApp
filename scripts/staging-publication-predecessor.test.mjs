import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  createPredecessorReport,
  deployedReadinessUrls,
  fetchDeployedReadiness,
  sha256,
  validateArtifactAndRun,
  validateDeployedReadiness,
  validateMigrationPublication,
  validatePublishedManifest,
  validateSameMigrationHead,
  validateSameMigrationTree,
} from "./staging-publication-predecessor.mjs";
import { createReleaseManifest } from "./phase6-release-manifest.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const previousSha = "1".repeat(40);
const candidateSha = "2".repeat(40);
const artifactId = 9_736_170_511;
const runId = 33_325_402_267;
const runAttempt = 1;
const repositoryId = 1_345_176_940;
const alphaPublicOrigin = "https://alpha.trevv.de";
const legacyPublicOrigin =
  "https://trevv-free-preview-web-zaman365.onrender.com";
const legacyOriginTransition = Object.freeze({
  artifactId: 9_739_632_252,
  gitSha: "a77a78b83d765a70c12f6cfb35017485c175e32c",
  releaseId: "rehearsal-candidate-33337660293-1",
  runAttempt: 1,
  runId: 33_337_660_293,
});
const digests = Object.freeze({
  api: `sha256:${"a".repeat(64)}`,
  migrate: `sha256:${"b".repeat(64)}`,
  web: `sha256:${"c".repeat(64)}`,
  worker: `sha256:${"d".repeat(64)}`,
});
const journal = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "packages/db/migrations/meta/_journal.json"),
    "utf8",
  ),
);
const migrationHead = journal.entries.at(-1).tag;

test("pins the exact public readiness endpoints for the deployed preview", () => {
  assert.deepEqual(deployedReadinessUrls, {
    web: "https://alpha.trevv.de/api/web/readyz",
    api: "https://trevv-free-preview-api-zaman365.onrender.com/api/v1/readyz",
    worker: "https://trevv-free-preview-worker-zaman365.onrender.com/readyz",
  });
});

test("authenticates a selected publication as the currently deployed cohort", () => {
  const fixture = predecessorFixture();
  const report = createPredecessorReport(fixture);

  assert.deepEqual(report.publication, {
    artifactId,
    artifactSha256: fixture.expectedArtifactSha256,
    runAttempt,
    runId,
    sourceSha: previousSha,
    workflowRun: `https://github.com/zaman365/trevv-webApp/actions/runs/${runId}`,
    releaseId: fixture.manifest.releaseId,
    manifestSha256: fixture.expectedManifestSha256,
    publishedMigrationHead: migrationHead,
  });
  assert.equal(report.readinessReportedCohort.web.imageId, digests.web);
  assert.equal(report.readinessReportedCohort.api.imageId, digests.api);
  assert.equal(report.readinessReportedCohort.worker.imageId, digests.worker);
  assert.deepEqual(report.migrationPolicy, {
    candidateHead: migrationHead,
    predecessorManifestHead: migrationHead,
    candidateMigrationTreeId: "3".repeat(40),
    predecessorMigrationTreeId: "3".repeat(40),
    policy: "same-head-and-tree-only",
    requiresGuardedMigration: false,
  });
  assert.deepEqual(report.databaseState, {
    verifiedByPublisher: false,
    requiredEvidence: "separate guarded migration rehearsal",
  });
  assert.deepEqual(report.deploymentState, {
    readinessIdentityVerified: true,
    platformImageDigestVerifiedByPublisher: false,
    requiredEvidence: "separate authenticated Render-state inspection",
  });
});

for (const { name, mutate, message } of [
  {
    name: "artifact ID mismatch",
    mutate: (fixture) => {
      fixture.artifact.id += 1;
    },
    message: /artifact ID does not match/u,
  },
  {
    name: "workflow run mismatch",
    mutate: (fixture) => {
      fixture.run.id += 1;
    },
    message: /does not belong to the supplied workflow run/u,
  },
  {
    name: "repository mismatch",
    mutate: (fixture) => {
      fixture.run.repository.full_name = "attacker/fork";
    },
    message: /repository identity is invalid/u,
  },
  {
    name: "workflow path mismatch",
    mutate: (fixture) => {
      fixture.run.path = ".github/workflows/untrusted.yml";
    },
    message: /not produced by the publisher workflow/u,
  },
  {
    name: "branch mismatch",
    mutate: (fixture) => {
      fixture.run.head_branch = "main";
    },
    message: /wrong branch/u,
  },
  {
    name: "artifact name mismatch",
    mutate: (fixture) => {
      fixture.artifact.name = "staging-image-digests-substitution";
    },
    message: /artifact name is invalid/u,
  },
  {
    name: "artifact metadata digest mismatch",
    mutate: (fixture) => {
      fixture.artifact.digest = `sha256:${"e".repeat(64)}`;
    },
    message: /metadata digest does not match/u,
  },
  {
    name: "downloaded artifact digest mismatch",
    mutate: (fixture) => {
      fixture.artifactBytes = Buffer.from("substituted artifact bytes");
      fixture.artifact.size_in_bytes = fixture.artifactBytes.length;
    },
    message: /downloaded predecessor artifact digest does not match/u,
  },
]) {
  test(`rejects ${name}`, () => {
    const fixture = predecessorFixture();
    mutate(fixture);
    assert.throws(() => validateArtifactAndRun(fixture), message);
  });
}

test("rejects a predecessor manifest raw-byte digest mismatch", () => {
  const fixture = predecessorFixture();
  fixture.expectedManifestSha256 = `sha256:${"f".repeat(64)}`;
  const publication = validateArtifactAndRun(fixture);
  assert.throws(
    () => validatePublishedManifest({ ...fixture, publication }),
    /manifest raw-byte digest does not match/u,
  );
});

test("rejects incomplete predecessor security-gate evidence", () => {
  const fixture = predecessorFixture();
  fixture.digestBundle.images.api.verification.requiredGates = ["syft-spdx"];
  const publication = validateArtifactAndRun(fixture);
  assert.throws(
    () => validatePublishedManifest({ ...fixture, publication }),
    /not a completed attested security gate/u,
  );
});

test("accepts the one exact deployed predecessor with the legacy Web origin", () => {
  const fixture = predecessorFixture({
    fixtureArtifactId: legacyOriginTransition.artifactId,
    fixturePreviousSha: legacyOriginTransition.gitSha,
    fixturePublicOrigin: legacyPublicOrigin,
    fixtureReleaseId: legacyOriginTransition.releaseId,
    fixtureRunAttempt: legacyOriginTransition.runAttempt,
    fixtureRunId: legacyOriginTransition.runId,
  });
  const publication = validateArtifactAndRun(fixture);

  assert.doesNotThrow(() =>
    validatePublishedManifest({ ...fixture, publication }),
  );
});

test("rejects an unrecognized predecessor Web origin", () => {
  const fixture = predecessorFixture({
    fixturePublicOrigin: "https://preview.example.com",
  });
  const publication = validateArtifactAndRun(fixture);

  assert.throws(
    () => validatePublishedManifest({ ...fixture, publication }),
    /predecessor publication profile is invalid/u,
  );
});

for (const { name, overrides } of [
  {
    name: "an unrelated publication",
    overrides: {
      fixtureArtifactId: artifactId,
      fixturePreviousSha: previousSha,
      fixtureReleaseId: "rehearsal-baseline-fixture",
      fixtureRunAttempt: runAttempt,
      fixtureRunId: runId,
    },
  },
  {
    name: "a different artifact ID",
    overrides: {
      fixtureArtifactId: legacyOriginTransition.artifactId + 1,
    },
  },
  {
    name: "a different workflow run",
    overrides: { fixtureRunId: legacyOriginTransition.runId + 1 },
  },
  {
    name: "a different workflow attempt",
    overrides: { fixtureRunAttempt: legacyOriginTransition.runAttempt + 1 },
  },
  {
    name: "a different source SHA",
    overrides: { fixturePreviousSha: "9".repeat(40) },
  },
  {
    name: "a different release ID",
    overrides: {
      fixtureReleaseId: "rehearsal-candidate-33337660293-2",
    },
  },
]) {
  test(`rejects the legacy Web origin for ${name}`, () => {
    const fixture = predecessorFixture({
      fixtureArtifactId: legacyOriginTransition.artifactId,
      fixturePreviousSha: legacyOriginTransition.gitSha,
      fixturePublicOrigin: legacyPublicOrigin,
      fixtureReleaseId: legacyOriginTransition.releaseId,
      fixtureRunAttempt: legacyOriginTransition.runAttempt,
      fixtureRunId: legacyOriginTransition.runId,
      ...overrides,
    });
    const publication = validateArtifactAndRun(fixture);

    assert.throws(
      () => validatePublishedManifest({ ...fixture, publication }),
      /predecessor publication profile is invalid/u,
    );
  });
}

for (const { name, mutate, message } of [
  {
    name: "release ID mismatch",
    mutate: (fixture) => {
      fixture.readiness.web.body.release.releaseId =
        "rehearsal-different-release";
    },
    message: /Web readiness does not match/u,
  },
  {
    name: "image ID mismatch",
    mutate: (fixture) => {
      fixture.readiness.api.body.release.imageId = `sha256:${"9".repeat(64)}`;
    },
    message: /API readiness does not match/u,
  },
  {
    name: "Git SHA mismatch",
    mutate: (fixture) => {
      fixture.readiness.worker.body.release.gitSha = "9".repeat(40);
    },
    message: /Worker readiness does not match/u,
  },
  {
    name: "Web upstream API mismatch",
    mutate: (fixture) => {
      fixture.readiness.web.body.apiRelease.imageId = `sha256:${"8".repeat(64)}`;
    },
    message: /Web upstream API readiness does not match/u,
  },
  {
    name: "unavailable response",
    mutate: (fixture) => {
      fixture.readiness.web = {
        status: 503,
        body: { status: "unavailable" },
      };
    },
    message: /Web readiness returned HTTP 503/u,
  },
]) {
  test(`rejects deployed readiness with ${name}`, () => {
    const fixture = predecessorFixture();
    mutate(fixture);
    assert.throws(
      () => validateDeployedReadiness(fixture.readiness, fixture.manifest),
      message,
    );
  });
}

test("rejects a candidate migration-head change", () => {
  const fixture = predecessorFixture();
  fixture.journal.entries.push({
    idx: fixture.journal.entries.length,
    version: "7",
    when: 1_788_100_000_000,
    tag: "0018_candidate_change",
    breakpoints: true,
  });
  assert.throws(
    () => validateSameMigrationHead(fixture.manifest, fixture.journal),
    /same-migration-head-only/u,
  );
});

test("rejects rewritten migration bytes even when the journal head is unchanged", () => {
  assert.throws(
    () => validateSameMigrationTree("3".repeat(40), "4".repeat(40)),
    /same-migration-tree-only/u,
  );
});

test("allows only an explicitly bound additive migration publication", () => {
  const fixture = predecessorFixture();
  const previousJournal = structuredClone(fixture.journal);
  const appendedTag = "0019_additive_platform_fixture";
  fixture.journal.entries.push({
    idx: fixture.journal.entries.length,
    version: "7",
    when: 1_788_100_000_000,
    tag: appendedTag,
    breakpoints: true,
  });
  const confirmation =
    `publish-additive-migration-successor:${candidateSha}:` +
    `${migrationHead}:${appendedTag}:${fixture.expectedManifestSha256}`;
  assert.deepEqual(
    validateMigrationPublication({
      manifest: fixture.manifest,
      previousJournal,
      journal: fixture.journal,
      predecessorMigrationTreeId: "3".repeat(40),
      candidateMigrationTreeId: "4".repeat(40),
      migrationChangedPaths: [
        {
          status: "M",
          path: "packages/db/migrations/meta/_journal.json",
        },
        {
          status: "A",
          path: `packages/db/migrations/${appendedTag}.sql`,
        },
        {
          status: "A",
          path: "packages/db/migrations/meta/0019_snapshot.json",
        },
      ],
      migrationChangeConfirmation: confirmation,
      candidateSha,
      predecessorManifestSha256: fixture.expectedManifestSha256,
    }),
    {
      candidateHead: appendedTag,
      predecessorManifestHead: migrationHead,
      candidateMigrationTreeId: "4".repeat(40),
      predecessorMigrationTreeId: "3".repeat(40),
      appendedMigrationHeads: [appendedTag],
      policy: "additive-forward-only-publication",
      requiresGuardedMigration: true,
    },
  );
});

test("rejects a migration publication that rewrites deployed history", () => {
  const fixture = predecessorFixture();
  const previousJournal = structuredClone(fixture.journal);
  fixture.journal.entries[0].when += 1;
  fixture.journal.entries.push({
    idx: fixture.journal.entries.length,
    version: "7",
    when: 1_788_100_000_000,
    tag: "0019_additive_platform_fixture",
    breakpoints: true,
  });
  assert.throws(
    () =>
      validateMigrationPublication({
        manifest: fixture.manifest,
        previousJournal,
        journal: fixture.journal,
        predecessorMigrationTreeId: "3".repeat(40),
        candidateMigrationTreeId: "4".repeat(40),
        migrationChangedPaths: [],
        migrationChangeConfirmation: "wrong",
        candidateSha,
        predecessorManifestSha256: fixture.expectedManifestSha256,
      }),
    /may not rewrite deployed journal entries/u,
  );
});

test("pins readiness fetches to the exact origins without redirects", async () => {
  const requests = [];
  const result = await fetchDeployedReadiness({
    fetchImplementation: async (url, options) => {
      requests.push({ url, options });
      return {
        status: 200,
        json: async () => ({ status: "fixture" }),
      };
    },
    timeoutMs: 100,
    retryMs: 1,
  });

  assert.deepEqual(Object.keys(result).sort(), ["api", "web", "worker"]);
  assert.deepEqual(
    requests.map(({ url }) => url).sort(),
    Object.values(deployedReadinessUrls).sort(),
  );
  assert.equal(
    requests.every(
      ({ options }) =>
        options.redirect === "error" && options.cache === "no-store",
    ),
    true,
  );
});

function predecessorFixture({
  fixtureArtifactId = artifactId,
  fixturePreviousSha = previousSha,
  fixturePublicOrigin = alphaPublicOrigin,
  fixtureReleaseId = "rehearsal-baseline-fixture",
  fixtureRunAttempt = runAttempt,
  fixtureRunId = runId,
} = {}) {
  const stagingGenesis = fixtureReleaseId.startsWith("rehearsal-baseline-");
  const manifest = createReleaseManifest(
    {
      schemaVersion: 1,
      template: false,
      releaseId: fixtureReleaseId,
      createdAt: "2026-08-30T17:37:10.534Z",
      gitSha: fixturePreviousSha,
      imageDigests: digests,
      database: {
        previousReleaseMigrationHead: stagingGenesis ? null : migrationHead,
        strategy: "additive-forward-only",
      },
      runtimes: { node: "22.23.2", pnpm: "11.22.0" },
      securityModes: {
        cspMode: "report-only",
        demoMode: false,
        errorReportingMode: "disabled",
        hstsEnabled: false,
        rateLimitBackend: "postgres",
        registrationMode: "invite_only",
      },
      previousRelease: stagingGenesis
        ? {
            environment: "staging",
            kind: "staging_genesis",
            previousCohort: null,
            reason: "no-prior-full-topology-cohort",
          }
        : {
            releaseId: "rehearsal-baseline-fixture",
            manifestDigest: `sha256:${"e".repeat(64)}`,
          },
      evidenceLinks: [],
      authorization: {
        status: "not_authorized",
        environment: "production",
        authorizedBy: null,
        authorizedAt: null,
        changeTicket: null,
        scopeDigest: null,
      },
    },
    { repositoryRoot, worktreeStatus: "" },
  );
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const artifactBytes = Buffer.from("fixture predecessor artifact bytes");
  const expectedArtifactSha256 = sha256(artifactBytes);
  const expectedManifestSha256 = sha256(manifestText);
  const release = (service) => ({
    releaseId: manifest.releaseId,
    gitSha: fixturePreviousSha,
    imageId: digests[service],
  });
  return {
    artifact: {
      id: fixtureArtifactId,
      name: `staging-image-digests-${fixturePreviousSha}-${fixtureRunId}-${fixtureRunAttempt}`,
      expired: false,
      digest: expectedArtifactSha256,
      size_in_bytes: artifactBytes.length,
      workflow_run: {
        id: fixtureRunId,
        head_branch: "trevv-foundation",
        head_sha: fixturePreviousSha,
        repository_id: repositoryId,
        head_repository_id: repositoryId,
      },
    },
    run: {
      id: fixtureRunId,
      run_attempt: fixtureRunAttempt,
      event: "workflow_dispatch",
      status: "completed",
      conclusion: "success",
      head_branch: "trevv-foundation",
      head_sha: fixturePreviousSha,
      path: ".github/workflows/publish-staging-images.yml",
      repository: {
        id: repositoryId,
        full_name: "zaman365/trevv-webApp",
      },
      head_repository: {
        id: repositoryId,
        full_name: "zaman365/trevv-webApp",
      },
    },
    artifactBytes,
    manifest,
    manifestText,
    digestBundle: digestBundle(manifest, {
      fixturePreviousSha,
      fixturePublicOrigin,
      fixtureRunAttempt,
      fixtureRunId,
    }),
    journal: structuredClone(journal),
    previousJournal: structuredClone(journal),
    migrationChangedPaths: [],
    migrationChangeConfirmation: "",
    predecessorMigrationTreeId: "3".repeat(40),
    candidateMigrationTreeId: "3".repeat(40),
    readiness: {
      web: {
        status: 200,
        body: {
          status: "ready",
          service: "trevv-web",
          mode: "live",
          registrationMode: "invite_only",
          api: "ready",
          release: release("web"),
          apiRelease: release("api"),
        },
      },
      api: {
        status: 200,
        body: {
          status: "ready",
          service: "trevv-api",
          version: "v1",
          mode: "live",
          registrationMode: "invite_only",
          database: "ready",
          release: release("api"),
        },
      },
      worker: {
        status: 200,
        body: {
          status: "ready",
          service: "trevv-worker",
          enabled: true,
          stopping: false,
          release: release("worker"),
        },
      },
    },
    expectedArtifactId: fixtureArtifactId,
    expectedArtifactSha256,
    expectedManifestSha256,
    candidateSha,
    repository: "zaman365/trevv-webApp",
  };
}

function digestBundle(
  manifest,
  { fixturePreviousSha, fixturePublicOrigin, fixtureRunAttempt, fixtureRunId },
) {
  const images = Object.fromEntries(
    Object.entries(digests).map(([service, digest]) => {
      const image = `ghcr.io/zaman365/trevv-${service}`;
      return [
        service,
        {
          image,
          tag: `unverified-candidate-${fixturePreviousSha}-${fixtureRunId}-${fixtureRunAttempt}`,
          digest,
          reference: `${image}@${digest}`,
          provenance: {
            url: `https://github.com/zaman365/trevv-webApp/attestations/${fixtureRunId}`,
          },
          verification: {
            status: "attested-security-gates-passed",
            requiredGates: ["syft-spdx", "grype-high-critical"],
            githubProvenanceIssued: true,
          },
        },
      ];
    }),
  );
  return {
    schemaVersion: 1,
    candidateId: `staging-${fixturePreviousSha}-${fixtureRunId}-${fixtureRunAttempt}`,
    sourceSha: fixturePreviousSha,
    publicationWorkflowSha: fixturePreviousSha,
    workflowRun: `https://github.com/zaman365/trevv-webApp/actions/runs/${fixtureRunId}`,
    createdAt: manifest.createdAt,
    platform: "linux/amd64",
    evidenceClass: "artifact-publication-only",
    deploymentPerformed: false,
    publicationProfile: {
      auxiliaryImages: [],
      classification: "disposable-free-preview",
      excludedEvidence: [
        "always-on-worker",
        "high-availability",
        "managed-backup-pitr",
        "private-service-networking",
        "production-readiness",
      ],
      intendedFreeWebServices: ["web", "api", "worker"],
      operatorRunOnly: ["migrate"],
    },
    build: {
      publicOrigin: fixturePublicOrigin,
      cspMode: "report-only",
      hstsEnabled: false,
    },
    images,
  };
}
