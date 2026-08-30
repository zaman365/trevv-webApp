import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import YAML from "yaml";
import { validateReleaseManifest } from "../../scripts/phase6-release-manifest.mjs";

const execFileAsync = promisify(execFile);
const trustedRepository = "zaman365/trevv-webApp";
const trustedRegistryOwner = "zaman365";
const trustedSignerWorkflow =
  "zaman365/trevv-webApp/.github/workflows/publish-staging-images.yml";
const trustedSourceRef = "refs/heads/trevv-foundation";
const previewPublicOrigin =
  "https://trevv-free-preview-web-zaman365.onrender.com";
const imageKeys = Object.freeze(["api", "migrate", "web", "worker"]);
const deployedServices = Object.freeze({
  "trevv-free-preview-api-zaman365": "api",
  "trevv-free-preview-web-zaman365": "web",
  "trevv-free-preview-worker-zaman365": "worker",
});
const databaseName = "trevv-free-preview-postgres-zaman365";
const checkedInTemplatePath = resolve(
  import.meta.dirname,
  "render.staging.template.yaml",
);
const repositoryRoot = resolve(import.meta.dirname, "../..");

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
  await main();

async function main() {
  const options = commandLineOptions(process.argv.slice(2));
  const requestedTemplatePath = resolve(options.template);
  if (requestedTemplatePath !== checkedInTemplatePath)
    throw new Error(
      `Alternate --template paths are not allowed; use ${checkedInTemplatePath}.`,
    );
  const manifest = JSON.parse(
    await readFile(resolve(options.manifest), "utf8"),
  );
  const imageEvidence = JSON.parse(
    await readFile(resolve(options.imageDigests), "utf8"),
  );
  JSON.parse(await readFile(resolve(options.provenanceBundle), "utf8"));
  JSON.parse(await readFile(resolve(options.manifestProvenanceBundle), "utf8"));
  const template = await readFile(checkedInTemplatePath, "utf8");

  if (manifest?.template === true)
    throw new Error("A release-manifest template cannot materialize staging.");
  const gitSha = requiredString(
    manifest.gitSha,
    "manifest.gitSha",
  ).toLowerCase();
  if (!/^[a-f0-9]{40}$/u.test(gitSha))
    throw new Error("manifest.gitSha must be a full Git SHA.");
  await verifyCheckedOutSource(gitSha);
  await verifyReleaseManifestAttestation(options, gitSha);
  const manifestErrors = validateReleaseManifest(manifest, {
    repositoryRoot: null,
  });
  if (manifestErrors.length > 0)
    throw new Error(
      `The release manifest is invalid:\n${manifestErrors.map((error) => `- ${error}`).join("\n")}`,
    );
  if (manifest.authorization.status !== "not_authorized")
    throw new Error(
      "The disposable preview requires authorization.status=not_authorized.",
    );

  const releaseId = requiredString(manifest.releaseId, "manifest.releaseId");
  if (!/^[a-z0-9][a-z0-9._+-]{7,127}$/u.test(releaseId))
    throw new Error("manifest.releaseId is not an immutable release ID.");
  const imageDigests = manifest.imageDigests;
  if (!isRecord(imageDigests))
    throw new Error("manifest.imageDigests is required.");
  const webDigest = digest(imageDigests.web, "manifest.imageDigests.web");
  const apiDigest = digest(imageDigests.api, "manifest.imageDigests.api");
  const workerDigest = digest(
    imageDigests.worker,
    "manifest.imageDigests.worker",
  );
  const migrationDigest = digest(
    imageDigests.migrate,
    "manifest.imageDigests.migrate",
  );

  const modes = manifest.securityModes;
  if (!isRecord(modes)) throw new Error("manifest.securityModes is required.");
  if (
    modes.demoMode !== false ||
    modes.registrationMode !== "invite_only" ||
    modes.rateLimitBackend !== "postgres" ||
    modes.errorReportingMode !== "disabled"
  )
    throw new Error(
      "Staging requires demoMode=false, invite_only registration, the PostgreSQL limiter, and disabled error reporting until an external adapter is approved.",
    );
  if (modes.cspMode !== "report-only" && modes.cspMode !== "enforce")
    throw new Error(
      "manifest.securityModes.cspMode must be report-only or enforce.",
    );
  if (typeof modes.hstsEnabled !== "boolean")
    throw new Error("manifest.securityModes.hstsEnabled must be boolean.");

  const owner = options.registryOwner;
  if (owner !== trustedRegistryOwner)
    throw new Error(`--registry-owner must be ${trustedRegistryOwner}.`);

  validateImageEvidence(imageEvidence, manifest);
  await verifyImageEvidenceAttestation(options, gitSha);

  const replacements = new Map([
    ["__TREV_RELEASE_ID__", releaseId],
    ["__TREV_RELEASE_GIT_SHA__", gitSha],
    ["__TREV_REGISTRY_OWNER__", owner],
    ["__TREV_WEB_IMAGE_SHA256__", webDigest.slice("sha256:".length)],
    ["__TREV_API_IMAGE_SHA256__", apiDigest.slice("sha256:".length)],
    ["__TREV_MIGRATE_IMAGE_SHA256__", migrationDigest.slice("sha256:".length)],
    ["__TREV_WORKER_IMAGE_SHA256__", workerDigest.slice("sha256:".length)],
    ["__TREV_CSP_MODE__", modes.cspMode],
    ["__TREV_HSTS_ENABLED__", String(modes.hstsEnabled)],
  ]);

  let output = template;
  for (const [token, value] of replacements)
    output = output.replaceAll(token, value);
  const remaining = [
    ...output.matchAll(/__[A-Z][A-Z0-9_]*__/gu),
    ...output.matchAll(/\$\{[A-Z][A-Z0-9_]*\}/gu),
    ...output.matchAll(/\{\{[^{}\n]+\}\}/gu),
  ].map((match) => match[0]);
  if (remaining.length > 0)
    throw new Error(
      `Unresolved Blueprint tokens: ${[...new Set(remaining)].join(", ")}`,
    );
  const migrationMarker = `# migrate-image: ghcr.io/${owner}/trevv-migrate@${migrationDigest}`;
  if (output.split(migrationMarker).length !== 2)
    throw new Error(
      "The Blueprint must contain exactly one approved immutable Migrate image marker.",
    );

  let blueprint;
  try {
    blueprint = YAML.parse(output, {
      maxAliasCount: 0,
      prettyErrors: true,
      uniqueKeys: true,
    });
  } catch (error) {
    throw new Error(`The materialized Blueprint is not valid YAML: ${error}`);
  }
  validateBlueprint(blueprint, manifest, owner);

  await writeFile(resolve(options.output), output, { flag: "wx", mode: 0o600 });
  process.stdout.write(
    `Verified publication provenance and materialized ${options.output} without secret values.\n`,
  );
}

function validateImageEvidence(evidence, releaseManifest) {
  if (!isRecord(evidence))
    throw new Error("The staging image digest bundle must be a JSON object.");
  exactKeys(
    evidence,
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
    "image evidence",
  );
  if (evidence.schemaVersion !== 1)
    throw new Error("image evidence schemaVersion must equal 1.");
  if (evidence.sourceSha !== releaseManifest.gitSha)
    throw new Error("image evidence sourceSha does not match manifest.gitSha.");
  if (evidence.publicationWorkflowSha !== releaseManifest.gitSha)
    throw new Error(
      "image evidence publicationWorkflowSha does not match manifest.gitSha.",
    );
  if (
    !new RegExp(
      `^staging-${releaseManifest.gitSha}-[1-9][0-9]*-[1-9][0-9]*$`,
      "u",
    ).test(String(evidence.candidateId ?? ""))
  )
    throw new Error("image evidence candidateId is invalid.");
  if (
    !/^https:\/\/github\.com\/zaman365\/trevv-webApp\/actions\/runs\/[1-9][0-9]*$/u.test(
      String(evidence.workflowRun ?? ""),
    )
  )
    throw new Error("image evidence workflowRun is invalid.");
  if (!Number.isFinite(Date.parse(String(evidence.createdAt ?? ""))))
    throw new Error("image evidence createdAt is invalid.");
  if (evidence.platform !== "linux/amd64")
    throw new Error("image evidence platform must be linux/amd64.");
  if (evidence.evidenceClass !== "artifact-publication-only")
    throw new Error("image evidence evidenceClass is invalid.");
  if (evidence.deploymentPerformed !== false)
    throw new Error("image evidence must not claim a deployment.");

  exactKeys(
    evidence.build,
    ["cspMode", "hstsEnabled", "publicOrigin"],
    "image evidence build",
  );
  if (evidence.build.publicOrigin !== previewPublicOrigin)
    throw new Error(
      `image evidence build.publicOrigin must be ${previewPublicOrigin}.`,
    );
  if (evidence.build.cspMode !== releaseManifest.securityModes.cspMode)
    throw new Error(
      "image evidence build.cspMode does not match the release manifest.",
    );
  if (evidence.build.hstsEnabled !== releaseManifest.securityModes.hstsEnabled)
    throw new Error(
      "image evidence build.hstsEnabled does not match the release manifest.",
    );

  exactKeys(evidence.images, imageKeys, "image evidence images");
  for (const key of imageKeys) {
    const record = evidence.images[key];
    exactKeys(
      record,
      ["digest", "image", "provenance", "reference", "tag", "verification"],
      `image evidence images.${key}`,
    );
    const image = `ghcr.io/${trustedRegistryOwner}/trevv-${key}`;
    const expectedDigest = releaseManifest.imageDigests[key];
    if (record.image !== image)
      throw new Error(`image evidence images.${key}.image is invalid.`);
    if (record.digest !== expectedDigest)
      throw new Error(
        `image evidence images.${key}.digest does not match the release manifest.`,
      );
    if (record.reference !== `${image}@${expectedDigest}`)
      throw new Error(`image evidence images.${key}.reference is invalid.`);
    if (
      !new RegExp(
        `^unverified-candidate-${releaseManifest.gitSha}-[1-9][0-9]*-[1-9][0-9]*$`,
        "u",
      ).test(String(record.tag ?? ""))
    )
      throw new Error(`image evidence images.${key}.tag is invalid.`);
    exactKeys(
      record.provenance,
      ["url"],
      `image evidence images.${key}.provenance`,
    );
    if (
      !/^https:\/\/github\.com\/zaman365\/trevv-webApp\/attestations\/[1-9][0-9]*$/u.test(
        String(record.provenance.url ?? ""),
      )
    )
      throw new Error(
        `image evidence images.${key}.provenance.url is invalid.`,
      );
    exactKeys(
      record.verification,
      ["githubProvenanceIssued", "requiredGates", "status"],
      `image evidence images.${key}.verification`,
    );
    if (
      record.verification.status !== "attested-security-gates-passed" ||
      record.verification.githubProvenanceIssued !== true ||
      JSON.stringify(record.verification.requiredGates) !==
        JSON.stringify(["syft-spdx", "grype-high-critical"])
    )
      throw new Error(
        `image evidence images.${key}.verification is not a completed attested security gate.`,
      );
  }

  exactKeys(
    evidence.publicationProfile,
    [
      "auxiliaryImages",
      "classification",
      "excludedEvidence",
      "intendedFreeWebServices",
      "operatorRunOnly",
    ],
    "image evidence publicationProfile",
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
      JSON.stringify(evidence.publicationProfile[key]) !==
      JSON.stringify(expected)
    )
      throw new Error(`image evidence publicationProfile.${key} is invalid.`);
}

async function verifyImageEvidenceAttestation(values, sourceDigest) {
  const arguments_ = [
    "attestation",
    "verify",
    resolve(values.imageDigests),
    "--bundle",
    resolve(values.provenanceBundle),
    "--repo",
    trustedRepository,
    "--signer-workflow",
    trustedSignerWorkflow,
    "--source-ref",
    trustedSourceRef,
    "--source-digest",
    sourceDigest,
    "--deny-self-hosted-runners",
  ];
  try {
    await execFileAsync("gh", arguments_, {
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `GitHub publication provenance verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function verifyReleaseManifestAttestation(values, sourceDigest) {
  const arguments_ = [
    "attestation",
    "verify",
    resolve(values.manifest),
    "--bundle",
    resolve(values.manifestProvenanceBundle),
    "--repo",
    trustedRepository,
    "--signer-workflow",
    trustedSignerWorkflow,
    "--source-ref",
    trustedSourceRef,
    "--source-digest",
    sourceDigest,
    "--deny-self-hosted-runners",
  ];
  try {
    await execFileAsync("gh", arguments_, {
      env: process.env,
      maxBuffer: 1024 * 1024,
    });
  } catch (error) {
    throw new Error(
      `GitHub release-manifest provenance verification failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function verifyCheckedOutSource(expectedSha) {
  let head;
  let status;
  try {
    ({ stdout: head } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryRoot,
      env: process.env,
      maxBuffer: 1024 * 1024,
    }));
    ({ stdout: status } = await execFileAsync(
      "git",
      ["status", "--porcelain=v1", "--untracked-files=all"],
      {
        cwd: repositoryRoot,
        env: process.env,
        maxBuffer: 1024 * 1024,
      },
    ));
  } catch (error) {
    throw new Error(
      `Unable to verify the local release checkout: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (head.trim().toLowerCase() !== expectedSha)
    throw new Error(
      "The local checkout HEAD does not match the attested release manifest Git SHA.",
    );
  if (status.trim())
    throw new Error(
      "The local release checkout is dirty; materialization requires the exact clean attested source tree.",
    );
}

export function validateBlueprint(blueprint, releaseManifest, owner) {
  if (!isRecord(blueprint))
    throw new Error("The materialized Blueprint must be a YAML mapping.");
  exactKeys(
    blueprint,
    ["databases", "envVarGroups", "previews", "services"],
    "Blueprint",
  );
  rejectForbiddenKeys(blueprint);
  assertExactJson("Render preview policy", blueprint.previews, {
    generation: "off",
  });

  if (!Array.isArray(blueprint.services) || blueprint.services.length !== 3)
    throw new Error("The Blueprint must define exactly three services.");
  const services = new Map();
  for (const service of blueprint.services) {
    if (!isRecord(service))
      throw new Error("Every Blueprint service must be a mapping.");
    if (!Object.hasOwn(deployedServices, service.name))
      throw new Error(
        `Unsupported Render service name: ${String(service.name)}.`,
      );
    if (services.has(service.name))
      throw new Error(`Duplicate Render service name: ${service.name}.`);
    services.set(service.name, service);
    if (service.type !== "web")
      throw new Error(`Render service ${service.name} must have type web.`);
    if (service.runtime !== "image")
      throw new Error(
        `Render service ${service.name} must use the image runtime.`,
      );
    if (service.plan !== "free")
      throw new Error(`Render service ${service.name} must use plan free.`);
    if (service.numInstances !== 1)
      throw new Error(`Render service ${service.name} must have one instance.`);
    if (service.autoDeployTrigger !== "off")
      throw new Error(
        `Render service ${service.name} must disable auto deploy.`,
      );
    const imageKey = deployedServices[service.name];
    const includesCommand = imageKey === "api" || imageKey === "worker";
    exactKeys(
      service,
      [
        "autoDeployTrigger",
        ...(includesCommand ? ["dockerCommand"] : []),
        "envVars",
        "healthCheckPath",
        "image",
        "maxShutdownDelaySeconds",
        "name",
        "numInstances",
        "plan",
        "region",
        "renderSubdomainPolicy",
        "runtime",
        "type",
      ],
      `Render service ${service.name}`,
    );
    exactKeys(service.image, ["url"], `Render service ${service.name} image`);
    const expectedServicePolicy = {
      api: {
        healthCheckPath: "/api/v1/readyz",
        maxShutdownDelaySeconds: 60,
      },
      worker: { healthCheckPath: "/readyz", maxShutdownDelaySeconds: 120 },
      web: {
        healthCheckPath: "/api/web/readyz",
        maxShutdownDelaySeconds: 60,
      },
    }[imageKey];
    if (
      service.region !== "frankfurt" ||
      service.renderSubdomainPolicy !== "enabled" ||
      service.healthCheckPath !== expectedServicePolicy.healthCheckPath ||
      service.maxShutdownDelaySeconds !==
        expectedServicePolicy.maxShutdownDelaySeconds
    )
      throw new Error(
        `Render service ${service.name} routing and lifecycle policy is outside the strict allowlist.`,
      );
    const expectedImage = `ghcr.io/${owner}/trevv-${imageKey}@${releaseManifest.imageDigests[imageKey]}`;
    if (service.image?.url !== expectedImage)
      throw new Error(
        `Render service ${service.name} must use the approved immutable image digest.`,
      );
  }
  for (const serviceName of Object.keys(deployedServices))
    if (!services.has(serviceName))
      throw new Error(
        `The Blueprint is missing Render service ${serviceName}.`,
      );

  if (!Array.isArray(blueprint.databases) || blueprint.databases.length !== 1)
    throw new Error("The Blueprint must define exactly one database.");
  const [database] = blueprint.databases;
  if (!isRecord(database) || database.name !== databaseName)
    throw new Error(`The only allowed database is ${databaseName}.`);
  exactKeys(
    database,
    [
      "databaseName",
      "ipAllowList",
      "name",
      "plan",
      "postgresMajorVersion",
      "region",
      "user",
    ],
    "Render PostgreSQL database",
  );
  if (database.plan !== "free")
    throw new Error("The Render PostgreSQL database must use plan free.");
  if (String(database.postgresMajorVersion) !== "17")
    throw new Error("The Render PostgreSQL database must use PostgreSQL 17.");
  if (
    database.region !== "frankfurt" ||
    database.databaseName !== "trevv_staging" ||
    database.user !== "trevv_staging" ||
    !Array.isArray(database.ipAllowList) ||
    database.ipAllowList.length !== 0
  )
    throw new Error(
      "The Render PostgreSQL identity, region, or initial IP allowlist is outside the strict allowlist.",
    );

  walk(blueprint, (key, value) => {
    if (key === "plan" && value !== "free")
      throw new Error("Every Render plan in the Blueprint must be free.");
    if (key !== "plan" && key.toLowerCase().endsWith("plan"))
      throw new Error(`Unsupported Render plan field: ${key}.`);
    if (key === "runtime" && value !== "image")
      throw new Error("Every Render service runtime must be image.");
  });
  validateRuntimeContract(blueprint, releaseManifest, services);
}

function validateRuntimeContract(blueprint, releaseManifest, services) {
  const apiOrigin = "https://trevv-free-preview-api-zaman365.onrender.com";
  const webOrigin = previewPublicOrigin;
  assertExactJson("Render shared runtime environment", blueprint.envVarGroups, [
    {
      name: "trevv-free-preview-runtime",
      envVars: [
        { key: "NODE_ENV", value: "production" },
        { key: "DEMO_MODE", value: "false" },
        { key: "RELEASE_METADATA_REQUIRED", value: "true" },
        { key: "RELEASE_ID", value: releaseManifest.releaseId },
        { key: "RELEASE_GIT_SHA", value: releaseManifest.gitSha },
      ],
    },
  ]);

  const api = services.get("trevv-free-preview-api-zaman365");
  assertExactJson("Render API environment", api.envVars, [
    { fromGroup: "trevv-free-preview-runtime" },
    { key: "RELEASE_IMAGE_ID", value: releaseManifest.imageDigests.api },
    { key: "PORT", value: "8787" },
    { key: "REGISTRATION_MODE", value: "invite_only" },
    { key: "DATABASE_URL", sync: false },
    { key: "DATABASE_CA_CERT_B64", sync: false },
    { key: "BETTER_AUTH_SECRET", generateValue: true },
    { key: "BETTER_AUTH_URL", value: apiOrigin },
    { key: "WEB_ORIGIN", value: webOrigin },
    { key: "MAIL_FROM", value: "preview@mail.trevv.de" },
    { key: "SMTP_HOST", value: "smtp.resend.com" },
    { key: "SMTP_PORT", value: "2587" },
    { key: "SMTP_SECURE", value: "false" },
    { key: "SMTP_REQUIRE_TLS", value: "true" },
    { key: "SMTP_USERNAME", value: "resend" },
    { key: "SMTP_PASSWORD", sync: false },
    { key: "RATE_LIMIT_BACKEND", value: "postgres" },
    { key: "RATE_LIMIT_HASH_SECRET", generateValue: true },
    { key: "TRUSTED_CLIENT_IP_HEADER", value: "x-forwarded-for" },
    { key: "ERROR_REPORTING_MODE", value: "disabled" },
    { key: "INTERNAL_METRICS_ENABLED", value: "false" },
  ]);

  const worker = services.get("trevv-free-preview-worker-zaman365");
  assertExactJson("Render Worker environment", worker.envVars, [
    { fromGroup: "trevv-free-preview-runtime" },
    { key: "RELEASE_IMAGE_ID", value: releaseManifest.imageDigests.worker },
    {
      key: "DATABASE_URL",
      fromService: {
        type: "web",
        name: "trevv-free-preview-api-zaman365",
        envVarKey: "DATABASE_URL",
      },
    },
    {
      key: "DATABASE_CA_CERT_B64",
      fromService: {
        type: "web",
        name: "trevv-free-preview-api-zaman365",
        envVarKey: "DATABASE_CA_CERT_B64",
      },
    },
    { key: "WORKER_ID", value: "trevv-free-preview-worker" },
    { key: "WORKER_ENABLED", value: "true" },
    { key: "WORKER_DISABLED_HANDLERS", value: "" },
    { key: "WORKER_POLL_INTERVAL_MS", value: "5000" },
    { key: "WORKER_ATTENTION_SWEEP_INTERVAL_MS", value: "60000" },
    { key: "WORKER_TELEMETRY_INTERVAL_MS", value: "30000" },
    { key: "WORKER_READINESS_MAX_STALENESS_MS", value: "60000" },
    { key: "WORKER_READINESS_MAX_READY_AGE_MS", value: "300000" },
    { key: "WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS", value: "300000" },
    { key: "WORKER_READINESS_MAX_DEAD_LETTERS", value: "0" },
    { key: "WORKER_BATCH_SIZE", value: "2" },
    { key: "WORKER_CONCURRENCY", value: "2" },
    { key: "WORKER_LEASE_MS", value: "30000" },
    { key: "WORKER_MAX_ATTEMPTS", value: "8" },
    { key: "WORKER_HEALTH_HOST", value: "0.0.0.0" },
    { key: "WORKER_HEALTH_PORT", value: "10000" },
    { key: "PORT", value: "10000" },
  ]);

  const web = services.get("trevv-free-preview-web-zaman365");
  assertExactJson("Render Web environment", web.envVars, [
    { fromGroup: "trevv-free-preview-runtime" },
    { key: "RELEASE_IMAGE_ID", value: releaseManifest.imageDigests.web },
    { key: "REGISTRATION_MODE", value: "invite_only" },
    { key: "PORT", value: "3000" },
    { key: "HOSTNAME", value: "0.0.0.0" },
    { key: "NEXT_PUBLIC_APP_URL", value: webOrigin },
    { key: "API_ORIGIN", value: apiOrigin },
    { key: "CSP_MODE", value: releaseManifest.securityModes.cspMode },
    {
      key: "HSTS_ENABLED",
      value: String(releaseManifest.securityModes.hstsEnabled),
    },
  ]);

  const databaseBootstrap =
    '/bin/sh -ceu \'case "$DATABASE_URL" in *"sslmode=verify-full"*) ;; ' +
    '*) echo "DATABASE_URL must use sslmode=verify-full." >&2; exit 64;; ' +
    'esac; umask 077; printf "%s" "$DATABASE_CA_CERT_B64" | base64 -d > ' +
    "/tmp/trevv-render-postgres-ca.pem; test -s /tmp/trevv-render-postgres-ca.pem; " +
    "export NODE_EXTRA_CA_CERTS=/tmp/trevv-render-postgres-ca.pem; ";
  if (
    api.dockerCommand !==
    `${databaseBootstrap}exec node apps/api/dist/index.js'`
  )
    throw new Error(
      "Render API dockerCommand is outside the strict allowlist.",
    );
  if (
    worker.dockerCommand !==
    `${databaseBootstrap}exec node apps/worker/dist/index.js'`
  )
    throw new Error(
      "Render Worker dockerCommand is outside the strict allowlist.",
    );
  if (Object.hasOwn(web, "dockerCommand"))
    throw new Error("Render Web must use the immutable image entrypoint.");

  walk(blueprint, (key, value) => {
    if (key === "key" && value === "AUTH_COOKIE_DOMAIN")
      throw new Error("The Render preview must use host-only cookies.");
  });
}

function assertExactJson(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label} is outside the strict allowlist.`);
}

function rejectForbiddenKeys(value) {
  const forbidden = new Set([
    "buildCommand",
    "cronSchedule",
    "creds",
    "disk",
    "disks",
    "fromRegistryCreds",
    "maxInstances",
    "minInstances",
    "preDeployCommand",
    "registryCredential",
    "registryCredentials",
    "startCommand",
    "scaling",
  ]);
  walk(value, (key, nestedValue) => {
    if (forbidden.has(key))
      throw new Error(`Forbidden paid or mutable Render field: ${key}.`);
    if (
      key === "type" &&
      new Set(["pserv", "worker", "cron", "job", "private"]).has(nestedValue)
    )
      throw new Error(`Forbidden Render resource type: ${nestedValue}.`);
  });
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, nestedValue] of Object.entries(value)) {
    visitor(key, nestedValue);
    walk(nestedValue, visitor);
  }
}

function exactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
}

function commandLineOptions(arguments_) {
  const values = new Map();
  const allowed = new Set([
    "--image-digests",
    "--manifest",
    "--manifest-provenance-bundle",
    "--output",
    "--provenance-bundle",
    "--registry-owner",
    "--template",
  ]);
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error(usage());
    if (!allowed.has(name)) throw new Error(`Unsupported option: ${name}`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}`);
    values.set(name, value);
  }
  for (const required of [
    "--image-digests",
    "--manifest",
    "--manifest-provenance-bundle",
    "--output",
    "--provenance-bundle",
    "--registry-owner",
  ])
    if (!values.has(required))
      throw new Error(`${required} is required.\n${usage()}`);
  return {
    imageDigests: values.get("--image-digests"),
    manifest: values.get("--manifest"),
    manifestProvenanceBundle: values.get("--manifest-provenance-bundle"),
    output: values.get("--output"),
    provenanceBundle: values.get("--provenance-bundle"),
    registryOwner: values.get("--registry-owner"),
    template: values.get("--template") ?? checkedInTemplatePath,
  };
}

function usage() {
  return [
    "Usage: node deploy/render/materialize-staging-blueprint.mjs",
    "  --manifest <release-manifest.json>",
    "  --manifest-provenance-bundle <staging-release-manifest.provenance.bundle.json>",
    "  --image-digests <staging-image-digests.json>",
    "  --provenance-bundle <staging-image-digests.provenance.bundle.json>",
    "  --registry-owner zaman365",
    "  --output <new-render.yaml>",
    "  [--template <template.yaml>]",
  ].join(" ");
}

function digest(value, label) {
  const normalized = requiredString(value, label).toLowerCase();
  if (!/^sha256:[a-f0-9]{64}$/u.test(normalized))
    throw new Error(`${label} must be an immutable sha256 digest.`);
  return normalized;
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${label} is required.`);
  return value.trim();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
