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

const job = (name) => workflow.jobs[name];
const stepNamed = (steps, name) => steps.find((step) => step.name === name);

test("dispatch and source verification enforce the fixed free-preview policy", () => {
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
  assert.deepEqual(inputs.genesis_confirmation, {
    description:
      "Type create-first-disposable-preview-genesis; this workflow is not valid for later cohorts",
    required: true,
    default: "",
    type: "string",
  });

  const verify = stepNamed(
    job("verify-source").steps,
    "Resolve and verify the source commit",
  );
  assert.equal(verify.env.CSP_MODE, "${{ inputs.csp_mode }}");
  assert.equal(
    verify.env.GENESIS_CONFIRMATION,
    "${{ inputs.genesis_confirmation }}",
  );
  assert.equal(verify.env.HSTS_ENABLED, "${{ inputs.hsts_enabled }}");
  assert.match(verify.run, /"\$CSP_MODE" != "report-only"/u);
  assert.match(verify.run, /"\$HSTS_ENABLED" != "false"/u);
  assert.match(
    verify.run,
    /"\$GENESIS_CONFIRMATION" != "create-first-disposable-preview-genesis"/u,
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
    /FROM service-runtime AS migrate\s+CMD \["node", "packages\/db\/dist\/migrate\.js"\]/u,
  );
  assert.match(
    dockerfileSource,
    /FROM service-runtime AS remote-migrate\s+CMD \["node", "packages\/db\/dist\/staging-migrate\.js"\]/u,
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

test("image attestation uses and promptly scrubs an isolated GHCR credential", () => {
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

  const prepare = stepNamed(steps, "Prepare isolated registry credentials");
  assert.match(
    prepare.run,
    /attestation_docker_config="\$\{RUNNER_TEMP\}\/trevv-attestation-docker-config"/u,
  );
  assert.match(prepare.run, /DOCKER_CONFIG=.*>> "\$GITHUB_ENV"/u);

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
  assert.match(cleanup.run, /> "\$DOCKER_CONFIG\/config\.json"/u);
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
