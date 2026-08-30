import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import YAML from "yaml";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const workflowPath = resolve(
  repositoryRoot,
  ".github/workflows/publish-staging-images.yml",
);
const workflowSource = await readFile(workflowPath, "utf8");
const workflow = YAML.parse(workflowSource);
const dockerfileSource = await readFile(
  resolve(repositoryRoot, "Dockerfile.staging"),
  "utf8",
);
const composeSource = await readFile(
  resolve(repositoryRoot, "compose.staging.yaml"),
  "utf8",
);
const developmentComposeSource = await readFile(
  resolve(repositoryRoot, "compose.yaml"),
  "utf8",
);
const ciSource = await readFile(
  resolve(repositoryRoot, ".github/workflows/ci.yml"),
  "utf8",
);
const nonProductionReleaseInputSource = await readFile(
  resolve(repositoryRoot, "scripts/nonproduction-release-input.mjs"),
  "utf8",
);
const releaseManifestTemplate = JSON.parse(
  await readFile(
    resolve(repositoryRoot, "release/release-manifest-input.template.json"),
    "utf8",
  ),
);
const packageManifest = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
);

const job = (name) => workflow.jobs[name];
const stepNamed = (steps, name) => steps.find((step) => step.name === name);

test("keeps the reviewed Node security baseline consistent", () => {
  const nodeVersion = "22.23.2";
  const nodeImage =
    "node:${NODE_VERSION}-alpine3.24@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32";

  assert.match(dockerfileSource, /ARG NODE_VERSION=22\.23\.2/u);
  assert.equal(dockerfileSource.split(nodeImage).length - 1, 3);
  assert.equal(
    [...ciSource.matchAll(/node-version: ([^\n]+)/gu)].every(
      ([, version]) => version.trim() === nodeVersion,
    ),
    true,
  );
  assert.equal(
    [...workflowSource.matchAll(/node-version: ([^\n]+)/gu)].every(
      ([, version]) => version.trim() === nodeVersion,
    ),
    true,
  );
  assert.match(
    nonProductionReleaseInputSource,
    /configuration\.nodeVersion \?\? "22\.23\.2"/u,
  );
  assert.equal(releaseManifestTemplate.runtimes.node, nodeVersion);
  assert.equal(packageManifest.engines.node, ">=22.23.2");
});

test("deployment images patch pinned Alpine-family bases", () => {
  assert.equal(dockerfileSource.split("apk upgrade --no-cache").length - 1, 6);
  assert.match(
    dockerfileSource,
    /FROM alpine:3\.24@sha256:28bd5fe8b56d1bd048e5babf5b10710ebe0bae67db86916198a6eec434943f8b AS alpine-runtime\s+RUN apk upgrade --no-cache/u,
  );
  assert.match(dockerfileSource, /FROM alpine-runtime AS mail-init/u);
  assert.match(
    dockerfileSource,
    /FROM postgres:17-alpine@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73 AS postgres-runtime\s+RUN apk upgrade --no-cache/u,
  );
  assert.match(
    dockerfileSource,
    /FROM nginx:stable-alpine-slim@sha256:ddde39c6e51f02fde7410c2e9c234cf2d0a4c7bdbbe176aeb37d8ad7ab4eb58c AS proxy\s+RUN apk upgrade --no-cache && \\\s+install -d -m 0755 \/run\/nginx/u,
  );
  assert.match(composeSource, /target: postgres-runtime/u);
  assert.match(composeSource, /target: mail-init/u);
  assert.doesNotMatch(composeSource, /^\s+image: (?:alpine|postgres):/mu);
  assert.match(developmentComposeSource, /target: postgres-runtime/u);
  assert.doesNotMatch(developmentComposeSource, /image: postgres:/u);
  assert.doesNotMatch(ciSource, /image: postgres:/u);
  assert.equal(ciSource.split("--target postgres-runtime").length - 1, 2);
  assert.equal(
    ciSource.split("docker rm --force trevv-ci-postgres").length - 1,
    2,
  );
});

test("final service images omit unused package managers", () => {
  assert.equal(
    dockerfileSource.split("/usr/local/lib/node_modules/npm").length - 1,
    2,
  );
  assert.equal(
    dockerfileSource.split("/usr/local/lib/node_modules/corepack").length - 1,
    2,
  );
  assert.equal(dockerfileSource.split("/opt/yarn-v1.22.22").length - 1, 2);
});

test("injects the self-signed Web CA only in the local Compose runtime", () => {
  const compose = YAML.parse(composeSource);
  const web = compose.services.web;
  const webStage = dockerfileSource.match(
    / AS web\s[\s\S]*?\sFROM [^\n]+ AS proxy/u,
  )?.[0];

  assert.ok(webStage);
  assert.doesNotMatch(webStage, /ENV NODE_EXTRA_CA_CERTS=/u);
  assert.equal(
    web.environment.NODE_EXTRA_CA_CERTS,
    "/etc/trevv-local-tls/ca.crt",
  );
  assert.equal(
    web.volumes.includes("staging-tls:/etc/trevv-local-tls:ro"),
    true,
  );
});

test("published services contain only isolated production deployments", () => {
  for (const [workspacePackage, directory] of [
    ["@founderhq/api", "api"],
    ["@founderhq/worker", "worker"],
    ["@founderhq/db", "db"],
  ]) {
    assert.match(
      dockerfileSource,
      new RegExp(
        `--filter=${workspacePackage.replace("/", "\\/")} --prod deploy --no-optional /runtime/${directory}`,
        "u",
      ),
    );
  }

  assert.match(
    dockerfileSource,
    /FROM service-runtime AS api\s+COPY --from=build --chown=node:node \/runtime\/api \/app\/apps\/api\s+COPY --from=build --chown=node:node \/app\/scripts\/api-readiness\.mjs \/app\/scripts\/api-readiness\.mjs/u,
  );
  assert.match(
    dockerfileSource,
    /FROM service-runtime AS worker\s+COPY --from=build --chown=node:node \/runtime\/worker \/app\/apps\/worker/u,
  );
  assert.match(
    dockerfileSource,
    /FROM service-runtime AS remote-migrate\s+COPY --from=build --chown=node:node \/runtime\/db \/app\/packages\/db/u,
  );
  assert.match(
    dockerfileSource,
    /FROM service-runtime AS topology-runtime\s+COPY --from=build --chown=node:node \/app \/app/u,
  );
  assert.doesNotMatch(
    dockerfileSource.match(
      /FROM service-runtime AS api[\s\S]*?FROM service-runtime AS topology-runtime/u,
    )[0],
    /COPY --from=build --chown=node:node \/app \/app/u,
  );
});

test("security scans remain fail-closed for every published image", () => {
  const scanJob = job("scan-images");
  assert.deepEqual(scanJob.strategy.matrix.target, [
    "web",
    "api",
    "worker",
    "migrate",
  ]);
  const scan = stepNamed(
    scanJob.steps,
    "Scan the local image for high and critical vulnerabilities",
  );
  assert.equal(scan.with["fail-build"], true);
  assert.equal(scan.with["severity-cutoff"], "high");
  assert.equal(scan.with["output-format"], "sarif");
  assert.deepEqual(job("attest-images").needs, [
    "verify-source",
    "scan-images",
  ]);
  assert.deepEqual(job("digest-bundle").needs, [
    "verify-source",
    "attest-images",
  ]);
});

test("dispatch binds the candidate to the selected deployed publication", () => {
  const inputs = workflow.on.workflow_dispatch.inputs;
  assert.deepEqual(inputs.csp_mode, {
    description: "Fixed report-only CSP for this disposable free preview",
    required: true,
    default: "report-only",
    type: "choice",
    options: ["report-only"],
  });
  assert.deepEqual(inputs.hsts_enabled, {
    description: "Fixed HSTS-off policy for this disposable free preview",
    required: true,
    default: "false",
    type: "choice",
    options: ["false"],
  });
  assert.deepEqual(inputs.previous_artifact_id, {
    description:
      "GitHub artifact ID for the currently deployed predecessor publication",
    required: true,
    default: "",
    type: "string",
  });
  assert.deepEqual(inputs.previous_artifact_sha256, {
    description: "SHA-256 of the exact deployed predecessor artifact ZIP",
    required: true,
    default: "",
    type: "string",
  });
  assert.deepEqual(inputs.previous_manifest_sha256, {
    description: "SHA-256 of the exact predecessor manifest file bytes",
    required: true,
    default: "",
    type: "string",
  });
  assert.deepEqual(inputs.successor_confirmation, {
    description:
      "Type publish-successor-from-deployed:<candidate-sha>:<previous-manifest-sha256>",
    required: true,
    default: "",
    type: "string",
  });
  assert.equal(inputs.genesis_confirmation, undefined);

  const verify = stepNamed(
    job("verify-source").steps,
    "Resolve and verify the source commit",
  );
  assert.equal(verify.env.CSP_MODE, "${{ inputs.csp_mode }}");
  assert.equal(
    verify.env.PREVIOUS_ARTIFACT_ID,
    "${{ inputs.previous_artifact_id }}",
  );
  assert.equal(
    verify.env.PREVIOUS_ARTIFACT_SHA256,
    "${{ inputs.previous_artifact_sha256 }}",
  );
  assert.equal(
    verify.env.PREVIOUS_MANIFEST_SHA256,
    "${{ inputs.previous_manifest_sha256 }}",
  );
  assert.equal(
    verify.env.SUCCESSOR_CONFIRMATION,
    "${{ inputs.successor_confirmation }}",
  );
  assert.equal(verify.env.HSTS_ENABLED, "${{ inputs.hsts_enabled }}");
  assert.match(verify.run, /"\$CSP_MODE" != "report-only"/u);
  assert.match(verify.run, /"\$HSTS_ENABLED" != "false"/u);
  assert.match(verify.run, /\^\[1-9\]\[0-9\]\*\$/u);
  assert.match(verify.run, /\^sha256:\[0-9a-f\]\{64\}\$/u);
  assert.match(
    verify.run,
    /publish-successor-from-deployed:\$\{source_sha\}:\$\{PREVIOUS_MANIFEST_SHA256\}/u,
  );
  assert.doesNotMatch(verify.run, /genesis/iu);
});

test("successor manifest authenticates and binds the deployed predecessor", () => {
  const digestJob = job("digest-bundle");
  assert.equal(digestJob.name, "Publish digest bundle and successor manifest");
  assert.deepEqual(digestJob.permissions, {
    actions: "read",
    attestations: "write",
    contents: "read",
    "id-token": "write",
  });

  const checkout = stepNamed(
    digestJob.steps,
    "Check out the exact verified source",
  );
  assert.equal(checkout.with["fetch-depth"], 0);

  const predecessor = stepNamed(
    digestJob.steps,
    "Authenticate the selected deployed predecessor",
  );
  const predecessorBuildx = stepNamed(
    digestJob.steps,
    "Set up Docker Buildx for deployed-predecessor availability checks",
  );
  assert.match(
    predecessorBuildx.uses,
    /^docker\/setup-buildx-action@[0-9a-f]{40}$/u,
  );
  assert.ok(predecessor?.run);
  assert.equal(
    predecessor.env.PREVIOUS_ARTIFACT_ID,
    "${{ inputs.previous_artifact_id }}",
  );
  assert.equal(
    predecessor.env.PREVIOUS_ARTIFACT_SHA256,
    "${{ inputs.previous_artifact_sha256 }}",
  );
  assert.equal(
    predecessor.env.PREVIOUS_MANIFEST_SHA256,
    "${{ inputs.previous_manifest_sha256 }}",
  );
  for (const requiredPattern of [
    /actions\/artifacts\/\$\{PREVIOUS_ARTIFACT_ID\}/u,
    /actions\/runs\/\$\{previous_run_id\}/u,
    /predecessor_migration_tree=\$\(git rev-parse/u,
    /"\$\{previous_source_sha\}:packages\/db\/migrations"/u,
    /candidate_migration_tree=\$\(git rev-parse/u,
    /"\$\{SOURCE_SHA\}:packages\/db\/migrations"/u,
    /git merge-base --is-ancestor "\$previous_sha" "\$SOURCE_SHA"/u,
    /sha256sum "\$predecessor_archive"/u,
    /The predecessor publication has an unexpected file inventory/u,
    /sha256sum "\$previous_manifest"/u,
    /node scripts\/staging-publication-predecessor\.mjs/u,
    /--artifact-metadata "\$artifact_metadata"/u,
    /--run-metadata "\$run_metadata"/u,
    /--migration-journal packages\/db\/migrations\/meta\/_journal\.json/u,
    /--predecessor-migration-tree "\$predecessor_migration_tree"/u,
    /--candidate-migration-tree "\$candidate_migration_tree"/u,
    /\.publication\.publishedMigrationHead/u,
    /\.migrationPolicy\.candidateHead/u,
    /\.migrationPolicy\.predecessorMigrationTreeId/u,
    /readinessReportedCohort/u,
    /readinessObservedAt/u,
    /GITHUB_STEP_SUMMARY/u,
    /gh attestation verify "\$previous_manifest"/u,
    /staging-image-digests\.provenance\.bundle\.json/u,
    /--source-ref refs\/heads\/trevv-foundation/u,
    /--source-digest "\$previous_sha"/u,
    /--deny-self-hosted-runners/u,
    /printf '\{"auths":\{\}\}\\n'/u,
    /DOCKER_CONFIG="\$predecessor_docker_config"/u,
    /docker buildx imagetools inspect "\$reference"/u,
  ]) {
    assert.match(predecessor.run, requiredPattern);
  }
  assert.doesNotMatch(
    predecessor.run,
    /latest_successful_run|immediate previous successful publication/u,
  );
  const summaryIndex = predecessor.run.indexOf("GITHUB_STEP_SUMMARY");
  assert.ok(
    summaryIndex > predecessor.run.lastIndexOf("gh attestation verify"),
  );
  assert.ok(
    summaryIndex >
      predecessor.run.indexOf('docker buildx imagetools inspect "$reference"'),
  );

  const successor = stepNamed(
    digestJob.steps,
    "Generate the authenticated non-production successor manifest",
  );
  assert.ok(successor?.run);
  assert.equal(
    successor.env.REHEARSAL_PREVIOUS_MANIFEST_PATH,
    "${{ steps.predecessor.outputs.manifest_path }}",
  );
  assert.equal(
    successor.env.REHEARSAL_PREVIOUS_MANIFEST_SHA256,
    "${{ steps.predecessor.outputs.manifest_sha256 }}",
  );
  assert.equal(
    successor.env.REHEARSAL_PREVIOUS_MIGRATION_HEAD,
    "${{ steps.predecessor.outputs.published_migration_head }}",
  );
  assert.equal(
    successor.env.REHEARSAL_PREVIOUS_RELEASE_ID,
    "${{ steps.predecessor.outputs.release_id }}",
  );
  assert.equal(
    successor.env.REHEARSAL_RELEASE_ID,
    "rehearsal-candidate-${{ github.run_id }}-${{ github.run_attempt }}",
  );
  assert.equal(successor.env.REHEARSAL_GENESIS, undefined);
  assert.match(
    successor.run,
    /\.previousRelease\.manifestDigest == \$previousManifestDigest/u,
  );
  assert.match(
    successor.run,
    /\.database\.previousReleaseMigrationHead == \$previousMigrationHead/u,
  );
  assert.doesNotMatch(
    JSON.stringify(digestJob),
    /create-first-disposable-preview-genesis|REHEARSAL_GENESIS/u,
  );
});

test("publishes the guarded remote migrator while compose retains its test-only migrator", () => {
  const buildJob = job("build-images");
  assert.deepEqual(buildJob.strategy.matrix.include, [
    { target: "web", docker_target: "web" },
    { target: "api", docker_target: "api" },
    { target: "worker", docker_target: "worker" },
    { target: "migrate", docker_target: "remote-migrate" },
  ]);
  const build = stepNamed(
    buildJob.steps,
    "Build and push the uniquely tagged unverified candidate",
  );
  assert.equal(build.with.target, "${{ matrix.docker_target }}");

  assert.match(
    dockerfileSource,
    /FROM service-runtime AS migrate\s+COPY --from=build --chown=node:node \/runtime\/db \/app\/packages\/db\s+CMD \["node", "packages\/db\/dist\/migrate\.js"\]/u,
  );
  assert.match(
    dockerfileSource,
    /FROM service-runtime AS remote-migrate\s+COPY --from=build --chown=node:node \/runtime\/db \/app\/packages\/db\s+CMD \["node", "packages\/db\/dist\/staging-migrate\.js"\]/u,
  );
  assert.match(
    composeSource,
    /\n  migrate:\n[\s\S]*?\n      target: migrate\n/u,
  );
  assert.doesNotMatch(composeSource, /target: remote-migrate/u);
});

test("digest publication consumes only the four target metadata files", async (t) => {
  const assemble = stepNamed(
    job("digest-bundle").steps,
    "Assemble the machine-readable digest bundle",
  );

  assert.ok(assemble?.run);
  for (const target of ["web", "api", "worker", "migrate"]) {
    assert.match(
      assemble.run,
      new RegExp(`\\$\\{EVIDENCE_DIR\\}/${target}\\.manifest\\.json`, "u"),
    );
  }
  assert.match(assemble.run, /"\$\{metadata_files\[@\]\}"/u);
  assert.doesNotMatch(
    assemble.run,
    /"\$\{EVIDENCE_DIR\}"\/\*\.manifest\.json/u,
  );
  assert.match(
    assemble.run,
    /-name '\*\.manifest\.json' ! -name '\*\.oci-manifest\.json'/u,
  );

  const context = await evidenceFixture(t);
  await runAssembly(assemble.run, context);

  const bundle = JSON.parse(await readFile(context.bundlePath, "utf8"));
  assert.match(
    bundle.createdAt,
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
  );
  assert.equal(new Date(bundle.createdAt).toISOString(), bundle.createdAt);
  assert.deepEqual(Object.keys(bundle.images).sort(), [
    "api",
    "migrate",
    "web",
    "worker",
  ]);
  for (const target of ["web", "api", "worker", "migrate"]) {
    assert.equal(
      bundle.images[target].image,
      `ghcr.io/zaman365/trevv-${target}`,
    );
    assert.doesNotMatch(bundle.images[target].image, /oci-substitution/u);
  }
});

test("digest publication rejects metadata filename-to-target substitution", async (t) => {
  const assemble = stepNamed(
    job("digest-bundle").steps,
    "Assemble the machine-readable digest bundle",
  );
  const context = await evidenceFixture(t);
  const apiPath = join(context.evidenceDirectory, "api.manifest.json");
  const api = JSON.parse(await readFile(apiPath, "utf8"));
  api.target = "web";
  await writeFile(apiPath, `${JSON.stringify(api)}\n`);

  await assert.rejects(runAssembly(assemble.run, context));
});

test("digest publication rejects an unexpected metadata target file", async (t) => {
  const assemble = stepNamed(
    job("digest-bundle").steps,
    "Assemble the machine-readable digest bundle",
  );
  const context = await evidenceFixture(t);
  await writeFile(
    join(context.evidenceDirectory, "substitute.manifest.json"),
    `${JSON.stringify(metadata("web", "e"))}\n`,
  );

  await assert.rejects(runAssembly(assemble.run, context));
});

test("image attestation uses and promptly scrubs a job-scoped GHCR credential", () => {
  const attestJob = job("attest-images");
  const steps = attestJob.steps;
  const loginIndex = steps.findIndex(
    (step) => step.name === "Log in to GHCR for registry attestation",
  );
  const attestIndex = steps.findIndex(
    (step) =>
      step.name === "Create GitHub provenance for the exact verified image",
  );
  const cleanupIndex = steps.findIndex(
    (step) => step.name === "Remove the registry attestation credential",
  );
  const recordIndex = steps.findIndex(
    (step) => step.name === "Record provenance in the verified image metadata",
  );

  assert.deepEqual(attestJob.permissions, {
    attestations: "write",
    contents: "read",
    "id-token": "write",
    packages: "write",
  });
  assert.equal(loginIndex, attestIndex - 1);
  assert.equal(cleanupIndex, attestIndex + 1);
  assert.equal(recordIndex, cleanupIndex + 1);

  assert.equal(
    stepNamed(steps, "Prepare isolated registry credentials"),
    undefined,
  );
  assert.doesNotMatch(JSON.stringify(steps), /DOCKER_CONFIG/u);

  const login = steps[loginIndex];
  assert.match(login.uses, /^docker\/login-action@[0-9a-f]{40}$/u);
  assert.deepEqual(login.with, {
    registry: "ghcr.io",
    username: "${{ github.actor }}",
    password: "${{ github.token }}",
  });

  const attest = steps[attestIndex];
  assert.match(attest.uses, /^actions\/attest-build-provenance@[0-9a-f]{40}$/u);
  assert.equal(attest.with["push-to-registry"], true);

  const cleanup = steps[cleanupIndex];
  assert.equal(cleanup.if, "${{ always() }}");
  assert.match(cleanup.run, /docker logout ghcr\.io/u);
  assert.match(cleanup.run, /> "\$\{HOME\}\/\.docker\/config\.json"/u);
  assert.match(cleanup.run, /chmod 0600/u);
  assert.match(cleanup.run, /\.auths \| length/u);
});

async function evidenceFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "trevv-publisher-workflow-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const evidenceDirectory = join(directory, "evidence");
  const outputDirectory = join(directory, "output");
  await mkdir(evidenceDirectory);
  await mkdir(outputDirectory);

  const digestCharacters = {
    web: "a",
    api: "b",
    worker: "c",
    migrate: "d",
  };
  for (const [target, digestCharacter] of Object.entries(digestCharacters)) {
    await writeFile(
      join(evidenceDirectory, `${target}.manifest.json`),
      `${JSON.stringify(metadata(target, digestCharacter))}\n`,
    );
    await writeFile(
      join(evidenceDirectory, `${target}.oci-manifest.json`),
      `${JSON.stringify({
        target,
        image: `ghcr.io/zaman365/trevv-${target}-oci-substitution`,
      })}\n`,
    );
  }

  return {
    evidenceDirectory,
    outputDirectory,
    bundlePath: join(outputDirectory, "staging-image-digests.json"),
  };
}

function metadata(target, digestCharacter) {
  const image = `ghcr.io/zaman365/trevv-${target}`;
  const digest = `sha256:${digestCharacter.repeat(64)}`;
  return {
    target,
    image,
    tag: `unverified-candidate-${"f".repeat(40)}-123-1`,
    digest,
    reference: `${image}@${digest}`,
    sourceSha: "f".repeat(40),
    provenance: { url: `https://github.com/example/attestations/${target}` },
    verification: {
      status: "attested-security-gates-passed",
      requiredGates: ["syft-spdx", "grype-high-critical"],
      githubProvenanceIssued: true,
    },
  };
}

async function runAssembly(script, context) {
  return execFileAsync("bash", ["-e", "-u", "-o", "pipefail", "-c", script], {
    env: {
      ...process.env,
      CSP_MODE: "report-only",
      EVIDENCE_DIR: context.evidenceDirectory,
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_RUN_ID: "123",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "zaman365/trevv-webApp",
      GITHUB_SHA: "f".repeat(40),
      HSTS_ENABLED: "false",
      OUTPUT_DIR: context.outputDirectory,
      PUBLIC_ORIGIN: "https://trevv-free-preview-web-zaman365.onrender.com",
      SOURCE_SHA: "f".repeat(40),
    },
  });
}
