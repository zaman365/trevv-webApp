import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import YAML from "yaml";
import { validateBlueprint } from "./materialize-staging-blueprint.mjs";
import {
  releaseAuthorizationScopeDigest,
  stableStringify,
} from "../../scripts/phase6-release-manifest.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const script = resolve(
  repositoryRoot,
  "deploy/render/materialize-staging-blueprint.mjs",
);
const defaultTemplate = resolve(
  repositoryRoot,
  "deploy/render/render.staging.template.yaml",
);
const publicOrigin = "https://alpha.trevv.de";

test("verifies provenance and materializes the exact free topology", async () => {
  const context = await fixture();

  await materialize(context);
  const output = await readFile(context.outputPath, "utf8");
  assert.doesNotMatch(output, /__[A-Z][A-Z0-9_]*__/u);
  assert.match(output, /ghcr\.io\/zaman365\/trevv-api@sha256:c{64}/u);
  assert.match(output, /ghcr\.io\/zaman365\/trevv-migrate@sha256:f{64}/u);
  assert.match(output, /value: "sha256:b{64}"/u);
  assert.match(output, /value: "report-only"/u);
  assert.match(output, /value: "false"/u);
  assert.doesNotMatch(output, /\bplan: (?!free\b)[^\n]+/u);
  assert.doesNotMatch(output, /\btype: (?:pserv|worker|cron|job)\b/u);
  assert.doesNotMatch(output, /\bpreDeployCommand:/u);
  assert.equal(output.match(/^  - type: web$/gmu)?.length, 3);
  assert.match(output, /migrate-image: ghcr\.io\/zaman365\/trevv-migrate/u);
  assert.match(output, /ghcr\.io\/zaman365\/trevv-worker@sha256:d{64}/u);
  assert.match(output, /domains:\n\s+- alpha\.trevv\.de/u);
  assert.doesNotMatch(output, /-----BEGIN [A-Z ]*PRIVATE KEY-----/u);
  assert.doesNotMatch(output, /(?:ghp|github_pat)_[A-Za-z0-9_]+/u);

  const calls = (await readFile(context.ghArgumentsPath, "utf8"))
    .trim()
    .split("__CALL__\n")
    .filter(Boolean)
    .map((value) => value.trim().split("\n"));
  const policyArguments = [
    "--repo",
    "zaman365/trevv-webApp",
    "--signer-workflow",
    "zaman365/trevv-webApp/.github/workflows/publish-staging-images.yml",
    "--source-ref",
    "refs/heads/trevv-foundation",
    "--source-digest",
    "a".repeat(40),
    "--deny-self-hosted-runners",
  ];
  assert.deepEqual(calls, [
    [
      "attestation",
      "verify",
      context.manifestPath,
      "--bundle",
      context.manifestProvenanceBundlePath,
      ...policyArguments,
    ],
    [
      "attestation",
      "verify",
      context.imageEvidencePath,
      "--bundle",
      context.provenanceBundlePath,
      ...policyArguments,
    ],
  ]);
});

test("preserves a migration artifact that differs from the API image", async () => {
  const context = await fixture();
  await materialize(context);
  const output = await readFile(context.outputPath, "utf8");
  assert.match(
    output,
    /trevv-api@sha256:c{64}[\s\S]*trevv-migrate@sha256:f{64}|trevv-migrate@sha256:f{64}[\s\S]*trevv-api@sha256:c{64}/u,
  );
});

test("rejects a release-manifest template", async () => {
  const manifest = releaseManifest();
  manifest.template = true;
  const context = await fixture({ manifest, reseal: false });
  await assert.rejects(
    materialize(context),
    /template cannot materialize staging/u,
  );
});

test("rejects a structurally malformed manifest even with matching integrity", async () => {
  const manifest = releaseManifest();
  delete manifest.database;
  sealManifest(manifest);
  const context = await fixture({ manifest });
  await assert.rejects(
    materialize(context),
    /database\.migrationHead is invalid/u,
  );
});

test("rejects a manifest whose reviewed bytes were tampered", async () => {
  const manifest = releaseManifest();
  manifest.releaseId = "trevv-staging-tampered-20260830";
  const context = await fixture({ manifest, reseal: false });
  await assert.rejects(
    materialize(context),
    /integrity\.payloadSha256 does not match/u,
  );
});

test("rejects a structurally valid production-authorized manifest", async () => {
  const manifest = releaseManifest();
  manifest.authorization = {
    status: "authorized",
    environment: "production",
    authorizedBy: "release-owner",
    authorizedAt: "2026-08-30T12:30:00.000Z",
    changeTicket: "CHANGE-1234",
    scopeDigest: null,
  };
  manifest.authorization.scopeDigest =
    releaseAuthorizationScopeDigest(manifest);
  sealManifest(manifest);
  const context = await fixture({ manifest });
  await assert.rejects(
    materialize(context),
    /requires authorization\.status=not_authorized/u,
  );
});

test("rejects digest evidence that does not match the release source", async () => {
  const evidence = imageEvidence(releaseManifest());
  evidence.sourceSha = "9".repeat(40);
  const context = await fixture({ evidence });
  await assert.rejects(
    materialize(context),
    /sourceSha does not match manifest\.gitSha/u,
  );
});

test("rejects publication from a different workflow commit", async () => {
  const evidence = imageEvidence(releaseManifest());
  evidence.publicationWorkflowSha = "9".repeat(40);
  const context = await fixture({ evidence });
  await assert.rejects(
    materialize(context),
    /publicationWorkflowSha does not match manifest\.gitSha/u,
  );
});

test("rejects build settings that differ from the release manifest", async () => {
  const evidence = imageEvidence(releaseManifest());
  evidence.build.cspMode = "enforce";
  const context = await fixture({ evidence });
  await assert.rejects(materialize(context), /build\.cspMode does not match/u);
});

test("rejects an image digest or reference that differs from the manifest", async () => {
  const evidence = imageEvidence(releaseManifest());
  evidence.images.api.digest = `sha256:${"8".repeat(64)}`;
  const context = await fixture({ evidence });
  await assert.rejects(
    materialize(context),
    /images\.api\.digest does not match/u,
  );
});

test("fails closed when release-manifest provenance verification fails", async () => {
  const context = await fixture({ ghExitCode: 1 });
  await assert.rejects(
    materialize(context),
    /GitHub release-manifest provenance verification failed/u,
  );
  await assert.rejects(readFile(context.outputPath), /ENOENT/u);
});

test("requires the exact clean attested source checkout", async () => {
  const wrongHead = await fixture({ gitHead: "9".repeat(40) });
  await assert.rejects(materialize(wrongHead), /HEAD does not match/u);
  await assert.rejects(readFile(wrongHead.outputPath), /ENOENT/u);

  const dirty = await fixture({
    gitStatus: " M deploy/render/render.staging.template.yaml\n",
  });
  await assert.rejects(materialize(dirty), /checkout is dirty/u);
  await assert.rejects(readFile(dirty.outputPath), /ENOENT/u);
});

test("the parsed default Blueprint pins topology, runtime security, and commands", async (t) => {
  const context = await fixture();
  await materialize(context);
  const blueprint = YAML.parse(await readFile(context.outputPath, "utf8"));
  assert.doesNotThrow(() =>
    validateBlueprint(blueprint, context.manifest, "zaman365"),
  );
  assert.equal(
    renderService(blueprint, "web").envVars.some(
      ({ key }) => key === "NODE_EXTRA_CA_CERTS",
    ),
    false,
  );
  assert.deepEqual(renderService(blueprint, "web").domains, ["alpha.trevv.de"]);
  assert.equal(
    renderService(blueprint, "web").renderSubdomainPolicy,
    "disabled",
  );
  assert.equal(
    Object.hasOwn(renderService(blueprint, "api"), "domains"),
    false,
  );
  assert.equal(
    Object.hasOwn(renderService(blueprint, "worker"), "domains"),
    false,
  );
  assert.equal(
    renderService(blueprint, "web").healthCheckPath,
    "/api/web/livez",
  );

  const cases = [
    [
      "demo mode",
      (copy) => {
        findEnv(copy.envVarGroups[0].envVars, "DEMO_MODE").value = "true";
      },
      /shared runtime environment is outside/u,
    ],
    [
      "parent-domain cookie",
      (copy) => {
        renderService(copy, "api").envVars.push({
          key: "AUTH_COOKIE_DOMAIN",
          value: "trevv.de",
        });
      },
      /API environment is outside/u,
    ],
    [
      "predecessor API cookie namespace",
      (copy) => {
        findEnv(
          renderService(copy, "api").envVars,
          "AUTH_COOKIE_PREFIX",
        ).value = "trevv";
      },
      /API environment is outside/u,
    ],
    [
      "wrong auth origin",
      (copy) => {
        findEnv(renderService(copy, "api").envVars, "BETTER_AUTH_URL").value =
          "https://api.staging.trevv.de";
      },
      /API environment is outside/u,
    ],
    [
      "public registration",
      (copy) => {
        findEnv(renderService(copy, "api").envVars, "REGISTRATION_MODE").value =
          "public";
      },
      /API environment is outside/u,
    ],
    [
      "memory rate limiter",
      (copy) => {
        findEnv(
          renderService(copy, "api").envVars,
          "RATE_LIMIT_BACKEND",
        ).value = "memory";
      },
      /API environment is outside/u,
    ],
    [
      "append-only forwarded client IP header",
      (copy) => {
        findEnv(
          renderService(copy, "api").envVars,
          "TRUSTED_CLIENT_IP_HEADER",
        ).value = "x-forwarded-for";
      },
      /API environment is outside/u,
    ],
    [
      "blocked SMTP port",
      (copy) => {
        findEnv(renderService(copy, "api").envVars, "SMTP_PORT").value = "587";
      },
      /API environment is outside/u,
    ],
    [
      "wrong Web API origin",
      (copy) => {
        findEnv(renderService(copy, "web").envVars, "API_ORIGIN").value =
          "https://example.invalid";
      },
      /Web environment is outside/u,
    ],
    [
      "predecessor Web cookie namespace",
      (copy) => {
        findEnv(
          renderService(copy, "web").envVars,
          "AUTH_COOKIE_PREFIX",
        ).value = "trevv";
      },
      /Web environment is outside/u,
    ],
    [
      "unreviewed CSP",
      (copy) => {
        findEnv(renderService(copy, "web").envVars, "CSP_MODE").value =
          "enforce";
      },
      /Web environment is outside/u,
    ],
    [
      "unreviewed HSTS",
      (copy) => {
        findEnv(renderService(copy, "web").envVars, "HSTS_ENABLED").value =
          "true";
      },
      /Web environment is outside/u,
    ],
    [
      "local-only Web CA path",
      (copy) => {
        renderService(copy, "web").envVars.push({
          key: "NODE_EXTRA_CA_CERTS",
          value: "/etc/trevv-local-tls/ca.crt",
        });
      },
      /Web environment is outside/u,
    ],
    [
      "API command exfiltration",
      (copy) => {
        renderService(copy, "api").dockerCommand += "; env";
      },
      /API dockerCommand is outside/u,
    ],
    [
      "Worker command exfiltration",
      (copy) => {
        renderService(copy, "worker").dockerCommand += "; env";
      },
      /Worker dockerCommand is outside/u,
    ],
    [
      "automatic preview generation",
      (copy) => {
        copy.previews.generation = "automatic";
      },
      /preview policy is outside/u,
    ],
    [
      "wrong Web custom domain",
      (copy) => {
        renderService(copy, "web").domains = ["preview.trevv.de"];
      },
      /must expose only alpha\.trevv\.de/u,
    ],
    [
      "extra Web custom domain",
      (copy) => {
        renderService(copy, "web").domains.push("preview.trevv.de");
      },
      /must expose only alpha\.trevv\.de/u,
    ],
    [
      "API custom domain",
      (copy) => {
        renderService(copy, "api").domains = ["api.alpha.trevv.de"];
      },
      /must contain exactly/u,
    ],
    [
      "wrong service region",
      (copy) => {
        renderService(copy, "api").region = "oregon";
      },
      /routing and lifecycle policy is outside/u,
    ],
    [
      "wrong health path",
      (copy) => {
        renderService(copy, "worker").healthCheckPath = "/livez";
      },
      /routing and lifecycle policy is outside/u,
    ],
    [
      "enabled retired Web subdomain",
      (copy) => {
        renderService(copy, "web").renderSubdomainPolicy = "enabled";
      },
      /routing and lifecycle policy is outside/u,
    ],
    [
      "widened database allowlist",
      (copy) => {
        copy.databases[0].ipAllowList = [{ source: "0.0.0.0/0" }];
      },
      /PostgreSQL identity, region, or initial IP allowlist is outside/u,
    ],
    [
      "paid plan",
      (copy) => {
        renderService(copy, "web").plan = "starter";
      },
      /must use plan free/u,
    ],
    [
      "mutable image",
      (copy) => {
        renderService(copy, "api").image.url =
          "ghcr.io/zaman365/trevv-api:latest";
      },
      /approved immutable image digest/u,
    ],
    [
      "registry credential",
      (copy) => {
        renderService(copy, "web").image.creds = { name: "private" };
      },
      /Forbidden paid or mutable Render field: creds/u,
    ],
  ];
  for (const [name, mutate, expected] of cases)
    await t.test(name, () => {
      const copy = structuredClone(blueprint);
      mutate(copy);
      assert.throws(
        () => validateBlueprint(copy, context.manifest, "zaman365"),
        expected,
      );
    });
});

test("refuses an alternate template even when it only changes a plan", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace("plan: free", "plan: starter"),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("an arbitrary template cannot add a fourth service", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const extra = [
    "  - type: web",
    "    name: unreviewed-service",
    "    runtime: image",
    "    plan: free",
    "    numInstances: 1",
    "    autoDeployTrigger: off",
    "    image:",
    `      url: ghcr.io/zaman365/trevv-web@sha256:${"b".repeat(64)}`,
  ].join("\n");
  const context = await fixture({ templateText: `${source}\n${extra}\n` });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("an arbitrary template cannot introduce a paid or mutable resource field", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace(
      "    plan: free",
      "    plan: free\n    preDeployCommand: echo unsafe",
    ),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("an arbitrary template cannot require private registry credentials", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace(
      "    image:\n      url:",
      "    image:\n      creds:\n        fromRegistryCreds:\n          name: private-registry\n      url:",
    ),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("arbitrary templates cannot introduce forbidden Render resource shapes", async (t) => {
  const source = await readFile(defaultTemplate, "utf8");
  const cases = [
    [
      "background worker type",
      source.replace("  - type: web", "  - type: worker"),
      /Alternate --template paths/u,
    ],
    [
      "persistent disk",
      source.replace("    plan: free", "    plan: free\n    disk: {}"),
      /Alternate --template paths/u,
    ],
    [
      "autoscaling block",
      source.replace("    plan: free", "    plan: free\n    scaling: {}"),
      /Alternate --template paths/u,
    ],
    [
      "cron collection",
      `${source}\ncronJobs: []\n`,
      /Alternate --template paths/u,
    ],
  ];
  for (const [name, templateText, expected] of cases)
    await t.test(name, async () => {
      const context = await fixture({ templateText });
      await assert.rejects(materialize(context), expected);
    });
});

test("an arbitrary template cannot use a mutable image", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace(
      "ghcr.io/__TREV_REGISTRY_OWNER__/trevv-api@sha256:__TREV_API_IMAGE_SHA256__",
      "ghcr.io/zaman365/trevv-api:latest",
    ),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("rejects unresolved tokens anywhere in an arbitrary template", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: `${source}\n# __UNREVIEWED_TOKEN__\n`,
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("requires the immutable Migrate image cohort marker", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace(
      "# migrate-image:",
      "# removed-migrate-image:",
    ),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("rejects malformed or duplicate-key YAML", async () => {
  const source = await readFile(defaultTemplate, "utf8");
  const context = await fixture({
    templateText: source.replace(
      "previews:\n  generation: off",
      "previews:\n  generation: off\n  generation: manual",
    ),
  });
  await assert.rejects(materialize(context), /Alternate --template paths/u);
});

test("rejects the retired auxiliary edge option", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      script,
      "--manifest",
      "manifest.json",
      "--image-digests",
      "staging-image-digests.json",
      "--provenance-bundle",
      "staging-image-digests.provenance.bundle.json",
      "--registry-owner",
      "zaman365",
      "--output",
      "render.yaml",
      "--edge-digest",
      `sha256:${"e".repeat(64)}`,
    ]),
    /Unsupported option: --edge-digest/u,
  );
});

test("the publication workflow requires source SHA to equal the branch workflow SHA", async () => {
  const workflowSource = await readFile(
    resolve(repositoryRoot, ".github/workflows/publish-staging-images.yml"),
    "utf8",
  );
  const workflow = YAML.parse(workflowSource);
  const sourceStep = workflow.jobs["verify-source"].steps.find(
    (step) => step.name === "Resolve and verify the source commit",
  );
  assert.ok(sourceStep?.run);
  assert.match(
    sourceStep.run,
    /test "\$\(git rev-parse origin\/trevv-foundation\)" = "\$GITHUB_SHA"/u,
  );
  assert.match(
    sourceStep.run,
    /if \[ "\$source_sha" != "\$GITHUB_SHA" \]; then/u,
  );
  assert.match(
    sourceStep.run,
    /origin\.origin !== "https:\/\/alpha\.trevv\.de"/u,
  );
  assert.doesNotMatch(sourceStep.run, /merge-base --is-ancestor/u);
  assert.match(workflowSource, /image: \.image,/u);
  assert.doesNotMatch(workflowSource, /\n\s+name: \.image,/u);
  assert.match(
    workflowSource,
    /\.value\.image == \("ghcr\.io\/zaman365\/trevv-" \+ \.key\)/u,
  );
});

function renderService(blueprint, suffix) {
  const value = blueprint.services.find((item) =>
    item.name.endsWith(`-${suffix}-zaman365`),
  );
  assert.ok(value, `Missing ${suffix} service fixture.`);
  return value;
}

function findEnv(envVars, key) {
  const value = envVars.find((item) => item.key === key);
  assert.ok(value, `Missing ${key} environment fixture.`);
  return value;
}

async function fixture({
  evidence,
  ghExitCode = 0,
  gitHead,
  gitStatus = "",
  manifest = releaseManifest(),
  reseal = true,
  templateText,
} = {}) {
  if (reseal) sealManifest(manifest);
  const directory = await mkdtemp(join(tmpdir(), "trevv-render-blueprint-"));
  const manifestPath = join(directory, "manifest.json");
  const imageEvidencePath = join(directory, "staging-image-digests.json");
  const provenanceBundlePath = join(
    directory,
    "staging-image-digests.provenance.bundle.json",
  );
  const manifestProvenanceBundlePath = join(
    directory,
    "staging-release-manifest.provenance.bundle.json",
  );
  const outputPath = join(directory, "render.yaml");
  const templatePath = join(directory, "template.yaml");
  const binDirectory = join(directory, "bin");
  const ghPath = join(binDirectory, "gh");
  const gitPath = join(binDirectory, "git");
  const ghArgumentsPath = join(directory, "gh-arguments.txt");
  await mkdir(binDirectory);
  await writeFile(manifestPath, JSON.stringify(manifest), { mode: 0o600 });
  await writeFile(
    imageEvidencePath,
    JSON.stringify(evidence ?? imageEvidence(manifest)),
    { mode: 0o600 },
  );
  await writeFile(
    provenanceBundlePath,
    JSON.stringify({ mediaType: "bundle" }),
    {
      mode: 0o600,
    },
  );
  await writeFile(
    manifestProvenanceBundlePath,
    JSON.stringify({ mediaType: "bundle" }),
    { mode: 0o600 },
  );
  await writeFile(
    templatePath,
    templateText ?? (await readFile(defaultTemplate, "utf8")),
    { mode: 0o600 },
  );
  await writeFile(
    ghPath,
    '#!/bin/sh\nprintf "%s\\n" "__CALL__" "$@" >> "$GH_ARGUMENTS_PATH"\nexit "$GH_EXIT_CODE"\n',
    { mode: 0o700 },
  );
  await chmod(ghPath, 0o700);
  await writeFile(
    gitPath,
    '#!/bin/sh\nif [ "$1" = "rev-parse" ] && [ "$2" = "HEAD" ]; then printf "%s\\n" "$GIT_HEAD"; exit 0; fi\nif [ "$1" = "status" ]; then printf "%s" "$GIT_STATUS"; exit 0; fi\nexit 2\n',
    { mode: 0o700 },
  );
  await chmod(gitPath, 0o700);
  return {
    binDirectory,
    ghArgumentsPath,
    ghExitCode,
    gitHead: gitHead ?? manifest.gitSha,
    gitStatus,
    imageEvidencePath,
    manifestPath,
    manifestProvenanceBundlePath,
    outputPath,
    provenanceBundlePath,
    templatePath: templateText === undefined ? null : templatePath,
    manifest,
  };
}

function materialize(context) {
  const arguments_ = [
    script,
    "--manifest",
    context.manifestPath,
    "--manifest-provenance-bundle",
    context.manifestProvenanceBundlePath,
    "--image-digests",
    context.imageEvidencePath,
    "--provenance-bundle",
    context.provenanceBundlePath,
    "--registry-owner",
    "zaman365",
    "--output",
    context.outputPath,
  ];
  if (context.templatePath) arguments_.push("--template", context.templatePath);
  return execFileAsync(process.execPath, arguments_, {
    env: {
      ...process.env,
      GH_ARGUMENTS_PATH: context.ghArgumentsPath,
      GH_EXIT_CODE: String(context.ghExitCode),
      GIT_HEAD: context.gitHead,
      GIT_STATUS: context.gitStatus,
      PATH: `${context.binDirectory}${delimiter}${process.env.PATH ?? ""}`,
    },
  });
}

function imageEvidence(manifest) {
  return {
    schemaVersion: 1,
    candidateId: `staging-${manifest.gitSha}-123-1`,
    sourceSha: manifest.gitSha,
    publicationWorkflowSha: manifest.gitSha,
    workflowRun: "https://github.com/zaman365/trevv-webApp/actions/runs/123",
    createdAt: "2026-08-30T12:15:00Z",
    platform: "linux/amd64",
    evidenceClass: "artifact-publication-only",
    deploymentPerformed: false,
    publicationProfile: {
      classification: "disposable-free-preview",
      intendedFreeWebServices: ["web", "api", "worker"],
      operatorRunOnly: ["migrate"],
      auxiliaryImages: [],
      excludedEvidence: [
        "always-on-worker",
        "high-availability",
        "managed-backup-pitr",
        "private-service-networking",
        "production-readiness",
      ],
    },
    build: {
      publicOrigin,
      cspMode: manifest.securityModes.cspMode,
      hstsEnabled: manifest.securityModes.hstsEnabled,
    },
    images: Object.fromEntries(
      ["api", "migrate", "web", "worker"].map((key, index) => {
        const image = `ghcr.io/zaman365/trevv-${key}`;
        const digest = manifest.imageDigests[key];
        return [
          key,
          {
            image,
            tag: `unverified-candidate-${manifest.gitSha}-123-1`,
            digest,
            reference: `${image}@${digest}`,
            provenance: {
              url: `https://github.com/zaman365/trevv-webApp/attestations/${index + 1}`,
            },
            verification: {
              status: "attested-security-gates-passed",
              requiredGates: ["syft-spdx", "grype-high-critical"],
              githubProvenanceIssued: true,
            },
          },
        ];
      }),
    ),
  };
}

function releaseManifest() {
  return sealManifest({
    schemaVersion: 1,
    releaseId: "trevv-staging-test-20260830",
    createdAt: "2026-08-30T12:00:00.000Z",
    gitSha: "a".repeat(40),
    imageDigests: {
      web: `sha256:${"b".repeat(64)}`,
      api: `sha256:${"c".repeat(64)}`,
      worker: `sha256:${"d".repeat(64)}`,
      migrate: `sha256:${"f".repeat(64)}`,
    },
    database: {
      migrationHead: "0010_preview",
      previousReleaseMigrationHead: "0009_preview",
      strategy: "additive-forward-only",
    },
    contracts: {
      openapiSha256: `sha256:${"e".repeat(64)}`,
    },
    runtimes: {
      node: "22.23.2",
      pnpm: "11.22.0",
    },
    securityModes: {
      demoMode: false,
      registrationMode: "invite_only",
      cspMode: "report-only",
      hstsEnabled: false,
      rateLimitBackend: "postgres",
      errorReportingMode: "disabled",
    },
    previousRelease: {
      releaseId: "trevv-staging-previous-20260829",
      manifestDigest: `sha256:${"9".repeat(64)}`,
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
  });
}

function sealManifest(manifest) {
  delete manifest.integrity;
  manifest.integrity = {
    payloadSha256: `sha256:${createHash("sha256")
      .update(stableStringify(manifest))
      .digest("hex")}`,
  };
  return manifest;
}
