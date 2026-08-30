#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateReleaseManifest } from "./phase6-release-manifest.mjs";

const expectedRepository = "zaman365/trevv-webApp";
const expectedBranch = "trevv-foundation";
const expectedWorkflowPath = ".github/workflows/publish-staging-images.yml";
const expectedPublicOrigin =
  "https://trevv-free-preview-web-zaman365.onrender.com";
const services = Object.freeze(["api", "migrate", "web", "worker"]);
const digestPattern = /^sha256:[0-9a-f]{64}$/u;
const gitShaPattern = /^[0-9a-f]{40}$/u;
const gitObjectIdPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const migrationPattern = /^\d{4}_[a-z0-9_]+$/u;
const releaseIdPattern = /^rehearsal-[a-z0-9][a-z0-9._+-]{0,110}$/u;

export const deployedReadinessUrls = Object.freeze({
  web: `${expectedPublicOrigin}/api/web/readyz`,
  api: "https://trevv-free-preview-api-zaman365.onrender.com/api/v1/readyz",
  worker: "https://trevv-free-preview-worker-zaman365.onrender.com/readyz",
});

export function sha256(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function migrationHeadFromJournal(journal) {
  if (!isRecord(journal) || !Array.isArray(journal.entries))
    throw new Error("The candidate migration journal is invalid.");
  const head = journal.entries.at(-1)?.tag;
  if (!migrationPattern.test(String(head ?? "")))
    throw new Error("The candidate migration journal has no valid head.");
  return head;
}

export function validateArtifactAndRun(input) {
  const {
    artifact,
    run,
    artifactBytes,
    expectedArtifactId,
    expectedArtifactSha256,
    candidateSha,
    repository = expectedRepository,
  } = input;

  if (repository !== expectedRepository)
    throw new Error(`The publisher is restricted to ${expectedRepository}.`);
  if (!Number.isSafeInteger(expectedArtifactId) || expectedArtifactId <= 0)
    throw new Error("The expected predecessor artifact ID is invalid.");
  if (!digestPattern.test(expectedArtifactSha256))
    throw new Error("The expected predecessor artifact digest is invalid.");
  if (!gitShaPattern.test(candidateSha))
    throw new Error("The candidate Git SHA is invalid.");
  if (!isRecord(artifact) || artifact.id !== expectedArtifactId)
    throw new Error("The predecessor artifact ID does not match the dispatch.");
  if (artifact.expired !== false)
    throw new Error("The predecessor artifact is expired.");
  if (artifact.digest !== expectedArtifactSha256)
    throw new Error(
      "The predecessor artifact metadata digest does not match the dispatch.",
    );
  if (!Buffer.isBuffer(artifactBytes))
    throw new Error("The downloaded predecessor artifact bytes are missing.");
  if (sha256(artifactBytes) !== expectedArtifactSha256)
    throw new Error(
      "The downloaded predecessor artifact digest does not match the dispatch.",
    );
  if (
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes <= 0 ||
    artifact.size_in_bytes !== artifactBytes.length
  )
    throw new Error(
      "The downloaded predecessor artifact size does not match its metadata.",
    );

  if (!isRecord(run) || !Number.isSafeInteger(run.id) || run.id <= 0)
    throw new Error("The predecessor workflow run metadata is invalid.");
  if (artifact.workflow_run?.id !== run.id)
    throw new Error(
      "The predecessor artifact does not belong to the supplied workflow run.",
    );
  if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0)
    throw new Error("The predecessor workflow run attempt is invalid.");
  if (
    run.event !== "workflow_dispatch" ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    throw new Error(
      "The predecessor workflow run is not a successful completed dispatch.",
    );
  if (run.path !== expectedWorkflowPath)
    throw new Error(
      "The predecessor was not produced by the publisher workflow.",
    );
  if (run.head_branch !== expectedBranch)
    throw new Error("The predecessor workflow run is from the wrong branch.");
  if (!gitShaPattern.test(String(run.head_sha ?? "")))
    throw new Error("The predecessor workflow run Git SHA is invalid.");
  if (run.head_sha === candidateSha)
    throw new Error("The candidate cannot be its own deployed predecessor.");
  if (
    run.repository?.full_name !== repository ||
    run.head_repository?.full_name !== repository ||
    !Number.isSafeInteger(run.repository?.id) ||
    run.repository.id <= 0 ||
    run.head_repository?.id !== run.repository.id
  )
    throw new Error(
      "The predecessor workflow run repository identity is invalid.",
    );

  const expectedName = `staging-image-digests-${run.head_sha}-${run.id}-${run.run_attempt}`;
  if (artifact.name !== expectedName)
    throw new Error("The predecessor artifact name is invalid.");
  if (
    artifact.workflow_run?.head_branch !== expectedBranch ||
    artifact.workflow_run?.head_sha !== run.head_sha ||
    artifact.workflow_run?.repository_id !== run.repository.id ||
    artifact.workflow_run?.head_repository_id !== run.repository.id
  )
    throw new Error(
      "The predecessor artifact workflow identity does not match its run.",
    );

  return {
    artifactId: artifact.id,
    artifactSha256: expectedArtifactSha256,
    runAttempt: run.run_attempt,
    runId: run.id,
    sourceSha: run.head_sha,
    workflowRun: `https://github.com/${repository}/actions/runs/${run.id}`,
  };
}

export function validatePublishedManifest(input) {
  const { manifestText, expectedManifestSha256, digestBundle, publication } =
    input;
  if (typeof manifestText !== "string" || manifestText.length === 0)
    throw new Error("The predecessor manifest bytes are missing.");
  if (!digestPattern.test(expectedManifestSha256))
    throw new Error("The expected predecessor manifest digest is invalid.");
  const actualManifestSha256 = sha256(manifestText);
  if (actualManifestSha256 !== expectedManifestSha256)
    throw new Error(
      "The predecessor manifest raw-byte digest does not match the dispatch.",
    );

  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("The predecessor manifest is not valid JSON.");
  }
  const manifestErrors = validateReleaseManifest(manifest, {
    repositoryRoot: null,
  });
  if (manifestErrors.length > 0)
    throw new Error(
      `The predecessor manifest is invalid: ${manifestErrors.join(" ")}`,
    );
  if (!releaseIdPattern.test(String(manifest.releaseId ?? "")))
    throw new Error(
      "The predecessor is not a non-production rehearsal release.",
    );
  if (manifest.gitSha !== publication.sourceSha)
    throw new Error(
      "The predecessor manifest Git SHA does not match its workflow run.",
    );
  if (manifest.authorization?.status !== "not_authorized")
    throw new Error("The predecessor must remain unauthorized for production.");
  const expectedSecurityModes = {
    cspMode: "report-only",
    demoMode: false,
    errorReportingMode: "disabled",
    hstsEnabled: false,
    rateLimitBackend: "postgres",
    registrationMode: "invite_only",
  };
  exactKeys(
    manifest.securityModes,
    Object.keys(expectedSecurityModes),
    "predecessor manifest securityModes",
  );
  for (const [key, expected] of Object.entries(expectedSecurityModes))
    if (manifest.securityModes[key] !== expected)
      throw new Error(
        "The predecessor manifest does not use the fixed disposable-preview security modes.",
      );

  validateImageEvidence(digestBundle, manifest, publication);

  return {
    manifest,
    manifestSha256: actualManifestSha256,
  };
}

export function validateImageEvidence(digestBundle, manifest, publication) {
  exactKeys(
    digestBundle,
    [
      "build",
      "candidateId",
      "createdAt",
      "deploymentPerformed",
      "evidenceClass",
      "images",
      "platform",
      "publicationProfile",
      "publicationWorkflowSha",
      "schemaVersion",
      "sourceSha",
      "workflowRun",
    ],
    "predecessor image evidence",
  );
  if (
    digestBundle.schemaVersion !== 1 ||
    digestBundle.sourceSha !== publication.sourceSha ||
    digestBundle.publicationWorkflowSha !== publication.sourceSha ||
    digestBundle.workflowRun !== publication.workflowRun ||
    digestBundle.evidenceClass !== "artifact-publication-only" ||
    digestBundle.deploymentPerformed !== false
  )
    throw new Error(
      "The predecessor image digest bundle does not match its authenticated publication.",
    );
  if (
    digestBundle.candidateId !==
    `staging-${publication.sourceSha}-${publication.runId}-${publication.runAttempt}`
  )
    throw new Error("The predecessor candidate ID is invalid.");
  if (digestBundle.platform !== "linux/amd64")
    throw new Error("The predecessor publication platform is invalid.");
  if (digestBundle.createdAt !== manifest.createdAt)
    throw new Error(
      "The predecessor publication timestamp does not match its manifest.",
    );
  exactKeys(
    digestBundle.build,
    ["cspMode", "hstsEnabled", "publicOrigin"],
    "predecessor image evidence build",
  );
  if (
    digestBundle.build.publicOrigin !== expectedPublicOrigin ||
    digestBundle.build.cspMode !== manifest.securityModes.cspMode ||
    digestBundle.build.hstsEnabled !== manifest.securityModes.hstsEnabled
  )
    throw new Error("The predecessor publication profile is invalid.");
  exactKeys(digestBundle.images, services, "predecessor image evidence images");
  for (const service of services) {
    const image = digestBundle.images[service];
    const expectedImage = `ghcr.io/zaman365/trevv-${service}`;
    const expectedTag = `unverified-candidate-${publication.sourceSha}-${publication.runId}-${publication.runAttempt}`;
    exactKeys(
      image,
      ["digest", "image", "provenance", "reference", "tag", "verification"],
      `predecessor image evidence images.${service}`,
    );
    if (
      image.image !== expectedImage ||
      image.tag !== expectedTag ||
      image.digest !== manifest.imageDigests?.[service] ||
      image.reference !== `${expectedImage}@${image.digest}`
    )
      throw new Error(`The predecessor ${service} image evidence is invalid.`);
    exactKeys(
      image.provenance,
      ["url"],
      `predecessor image evidence images.${service}.provenance`,
    );
    if (
      !/^https:\/\/github\.com\/zaman365\/trevv-webApp\/attestations\/[1-9][0-9]*$/u.test(
        String(image.provenance.url ?? ""),
      )
    )
      throw new Error(`The predecessor ${service} provenance URL is invalid.`);
    exactKeys(
      image.verification,
      ["githubProvenanceIssued", "requiredGates", "status"],
      `predecessor image evidence images.${service}.verification`,
    );
    if (
      image.verification.status !== "attested-security-gates-passed" ||
      image.verification.githubProvenanceIssued !== true ||
      JSON.stringify(image.verification.requiredGates) !==
        JSON.stringify(["syft-spdx", "grype-high-critical"])
    )
      throw new Error(
        `The predecessor ${service} verification is not a completed attested security gate.`,
      );
  }

  exactKeys(
    digestBundle.publicationProfile,
    [
      "auxiliaryImages",
      "classification",
      "excludedEvidence",
      "intendedFreeWebServices",
      "operatorRunOnly",
    ],
    "predecessor image evidence publicationProfile",
  );
  const expectedProfile = {
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
  };
  for (const [key, expected] of Object.entries(expectedProfile))
    if (
      JSON.stringify(digestBundle.publicationProfile[key]) !==
      JSON.stringify(expected)
    )
      throw new Error(`The predecessor publicationProfile.${key} is invalid.`);
}

export function validateSameMigrationHead(manifest, journal) {
  const predecessorManifestHead = manifest?.database?.migrationHead;
  if (!migrationPattern.test(String(predecessorManifestHead ?? "")))
    throw new Error("The predecessor publication migration head is invalid.");
  const candidateHead = migrationHeadFromJournal(journal);
  if (candidateHead !== predecessorManifestHead)
    throw new Error(
      `This publisher is same-migration-head-only: candidate ${candidateHead} does not match deployed publication ${predecessorManifestHead}.`,
    );
  return { candidateHead, predecessorManifestHead };
}

export function validateSameMigrationTree(
  predecessorMigrationTreeId,
  candidateMigrationTreeId,
) {
  if (!gitObjectIdPattern.test(String(predecessorMigrationTreeId ?? "")))
    throw new Error("The predecessor migration tree object ID is invalid.");
  if (!gitObjectIdPattern.test(String(candidateMigrationTreeId ?? "")))
    throw new Error("The candidate migration tree object ID is invalid.");
  if (candidateMigrationTreeId !== predecessorMigrationTreeId)
    throw new Error(
      "This publisher is same-migration-tree-only: applied migration files or metadata differ from the deployed publication.",
    );
  return { candidateMigrationTreeId, predecessorMigrationTreeId };
}

export function validateDeployedReadiness(readiness, manifest) {
  for (const service of ["web", "api", "worker"]) {
    const response = readiness?.[service];
    if (!isRecord(response) || response.status !== 200)
      throw new Error(
        `${capitalize(service)} readiness returned HTTP ${String(response?.status ?? "unavailable")}.`,
      );
    if (!isRecord(response.body))
      throw new Error(
        `${capitalize(service)} readiness returned invalid JSON.`,
      );
  }

  const web = readiness.web.body;
  const api = readiness.api.body;
  const worker = readiness.worker.body;
  if (
    web.status !== "ready" ||
    web.service !== "trevv-web" ||
    web.mode !== "live" ||
    web.registrationMode !== "invite_only" ||
    web.api !== "ready"
  )
    throw new Error("Web does not report live invite-only readiness.");
  if (
    api.status !== "ready" ||
    api.service !== "trevv-api" ||
    api.version !== "v1" ||
    api.mode !== "live" ||
    api.registrationMode !== "invite_only" ||
    api.database !== "ready"
  )
    throw new Error("API does not report live invite-only database readiness.");
  if (
    worker.status !== "ready" ||
    worker.service !== "trevv-worker" ||
    worker.enabled !== true ||
    worker.stopping !== false
  )
    throw new Error("Worker does not report active readiness.");

  validateReleaseIdentity(web.release, manifest, "web", "Web");
  validateReleaseIdentity(api.release, manifest, "api", "API");
  validateReleaseIdentity(worker.release, manifest, "worker", "Worker");
  validateReleaseIdentity(web.apiRelease, manifest, "api", "Web upstream API");

  return {
    api: api.release,
    web: web.release,
    worker: worker.release,
  };
}

export function createPredecessorReport(input) {
  const publication = validateArtifactAndRun(input);
  const { manifest, manifestSha256 } = validatePublishedManifest({
    ...input,
    publication,
  });
  const migrationPolicy = validateSameMigrationHead(manifest, input.journal);
  const migrationTrees = validateSameMigrationTree(
    input.predecessorMigrationTreeId,
    input.candidateMigrationTreeId,
  );
  const readinessReportedCohort = validateDeployedReadiness(
    input.readiness,
    manifest,
  );
  return {
    publication: {
      ...publication,
      releaseId: manifest.releaseId,
      manifestSha256,
      publishedMigrationHead: manifest.database.migrationHead,
    },
    readinessReportedCohort,
    migrationPolicy: {
      ...migrationPolicy,
      ...migrationTrees,
      policy: "same-head-and-tree-only",
    },
    databaseState: {
      verifiedByPublisher: false,
      requiredEvidence: "separate guarded migration rehearsal",
    },
    deploymentState: {
      readinessIdentityVerified: true,
      platformImageDigestVerifiedByPublisher: false,
      requiredEvidence: "separate authenticated Render-state inspection",
    },
  };
}

export async function fetchDeployedReadiness({
  fetchImplementation = fetch,
  timeoutMs = 180_000,
  retryMs = 5_000,
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = "no response";
  while (Date.now() < deadline) {
    try {
      const entries = await Promise.all(
        Object.entries(deployedReadinessUrls).map(async ([service, url]) => {
          const response = await fetchImplementation(url, {
            cache: "no-store",
            headers: { accept: "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(15_000),
          });
          return [
            service,
            {
              status: response.status,
              body: await response.json().catch(() => null),
            },
          ];
        }),
      );
      const result = Object.fromEntries(entries);
      const retryable = Object.values(result).some(({ status }) =>
        [429, 502, 503, 504].includes(status),
      );
      if (!retryable) return result;
      lastFailure = Object.entries(result)
        .map(([service, response]) => `${service}=HTTP ${response.status}`)
        .join(", ");
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }
  throw new Error(
    `The deployed Render cohort did not become readable within ${timeoutMs / 1_000} seconds (${lastFailure}).`,
  );
}

function validateReleaseIdentity(value, manifest, service, label) {
  if (
    !isRecord(value) ||
    value.releaseId !== manifest.releaseId ||
    value.gitSha !== manifest.gitSha ||
    value.imageId !== manifest.imageDigests?.[service]
  )
    throw new Error(
      `${label} readiness does not match the selected deployed publication.`,
    );
}

function capitalize(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected, label) {
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted))
    throw new Error(`${label} contains missing or unexpected fields.`);
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (!name?.startsWith("--") || value === undefined)
      throw new Error("Every CLI option must use --name value syntax.");
    if (values.has(name)) throw new Error(`Duplicate CLI option: ${name}.`);
    values.set(name, value);
  }
  const required = (name) => {
    const value = values.get(name);
    if (!value) throw new Error(`${name} is required.`);
    return value;
  };
  const allowed = new Set([
    "--artifact-metadata",
    "--run-metadata",
    "--archive",
    "--manifest",
    "--digest-bundle",
    "--migration-journal",
    "--artifact-id",
    "--artifact-sha256",
    "--manifest-sha256",
    "--candidate-sha",
    "--predecessor-migration-tree",
    "--candidate-migration-tree",
    "--repository",
  ]);
  for (const name of values.keys())
    if (!allowed.has(name)) throw new Error(`Unknown CLI option: ${name}.`);
  return {
    artifactMetadataPath: required("--artifact-metadata"),
    runMetadataPath: required("--run-metadata"),
    archivePath: required("--archive"),
    manifestPath: required("--manifest"),
    digestBundlePath: required("--digest-bundle"),
    migrationJournalPath: required("--migration-journal"),
    expectedArtifactId: Number(required("--artifact-id")),
    expectedArtifactSha256: required("--artifact-sha256"),
    expectedManifestSha256: required("--manifest-sha256"),
    candidateSha: required("--candidate-sha"),
    predecessorMigrationTreeId: required("--predecessor-migration-tree"),
    candidateMigrationTreeId: required("--candidate-migration-tree"),
    repository: required("--repository"),
  };
}

async function readJson(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [artifact, run, artifactBytes, manifestText, digestBundle, journal] =
    await Promise.all([
      readJson(options.artifactMetadataPath, "Artifact metadata"),
      readJson(options.runMetadataPath, "Workflow run metadata"),
      readFile(options.archivePath),
      readFile(options.manifestPath, "utf8"),
      readJson(options.digestBundlePath, "Image digest bundle"),
      readJson(options.migrationJournalPath, "Migration journal"),
    ]);
  const readiness = await fetchDeployedReadiness();
  const report = createPredecessorReport({
    ...options,
    artifact,
    run,
    artifactBytes,
    manifestText,
    digestBundle,
    journal,
    readiness,
  });
  process.stdout.write(
    `${JSON.stringify(
      { ...report, readinessObservedAt: new Date().toISOString() },
      null,
      2,
    )}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(
      `Staging predecessor verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
