import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";
import { verifyRetainedChecks } from "./verify-navigation-retry.mjs";

const workflow = parse(
  readFileSync(
    new URL(
      "../.github/workflows/publish-northflank-images.yml",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("full checks are manual diagnostics without an extra release-gate job", () => {
  const ci = parse(
    readFileSync(
      new URL("../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(ci.on), ["workflow_dispatch"]);
  assert.deepEqual(Object.keys(ci.jobs), [
    "quality",
    "e2e",
    "accessibility",
    "live-identity",
    "staging-topology",
  ]);
});

test("Northflank publication verifies the selected source without requiring CI or retries", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.jobs["verify-source"], undefined);
  const build = workflow.jobs["build-images"];
  assert.equal(build.needs, undefined);
  assert.equal(build.env.SOURCE_SHA, "${{ github.sha }}");
  assert.equal(build.steps[0].with.ref, "${{ github.sha }}");
  const verify = build.steps.find(
    (step) => step.name === "Verify the checkout is exact and clean",
  );
  assert.match(verify.run, /test "\$\(git rev-parse HEAD\)" = "\$SOURCE_SHA"/);
  assert.match(verify.run, /test -z "\$\(git status --porcelain\)"/);
  assert.doesNotMatch(
    JSON.stringify(workflow),
    /ci\.yml|verify-navigation-retry|successful_runs/,
  );
});

function retainedResults() {
  return {
    repository: "zaman365/trevv-webApp",
    run: {
      id: 123,
      run_attempt: 1,
      head_sha: "a".repeat(40),
      path: ".github/workflows/ci.yml",
      head_repository: { full_name: "zaman365/trevv-webApp" },
      event: "push",
      status: "completed",
      conclusion: "failure",
    },
    changedFiles: [".github/workflows/worker-navigation-retry.yml"],
    jobs: [
      ...["quality", "accessibility", "live-identity", "staging-topology"].map(
        (name) => ({ name, conclusion: "success" }),
      ),
      {
        name: "e2e",
        conclusion: "failure",
        steps: [
          { name: "Run pnpm test:e2e", conclusion: "success" },
          {
            name: "Guard background refresh responsiveness",
            conclusion: "success",
          },
          {
            name: "Guard production Worker navigation requests",
            conclusion: "failure",
          },
        ],
      },
    ],
  };
}

test("focused retry reuses completed results only when application and test behavior are unchanged", () => {
  assert.equal(verifyRetainedChecks(retainedResults()).sourceCiRunId, 123);
  const manual = retainedResults();
  manual.run.event = "workflow_dispatch";
  assert.equal(verifyRetainedChecks(manual).sourceCiRunId, 123);
  for (const path of [
    "apps/web/app/workspace.css",
    "apps/api/src/server.ts",
    "pnpm-lock.yaml",
    "Dockerfile.staging",
    "tests/worker/navigation.spec.ts",
    "playwright.worker.config.ts",
  ]) {
    const input = retainedResults();
    input.changedFiles.push(path);
    assert.throws(() => verifyRetainedChecks(input), /Cannot reuse checks/);
  }
});

test("focused retry rejects missing, failed, skipped and foreign source checks", () => {
  for (const conclusion of ["failure", "skipped", "cancelled", null]) {
    const input = retainedResults();
    input.jobs[0].conclusion = conclusion;
    assert.throws(() => verifyRetainedChecks(input));
  }
  for (const alter of [
    (input) => input.jobs.splice(1, 1),
    (input) => (input.jobs.at(-1).steps[0].conclusion = "failure"),
    (input) => (input.jobs.at(-1).steps[1].conclusion = "skipped"),
    (input) => (input.run.head_repository.full_name = "someone/else"),
    (input) => (input.run.event = "pull_request"),
    (input) => (input.run.status = "in_progress"),
  ]) {
    const input = retainedResults();
    alter(input);
    assert.throws(() => verifyRetainedChecks(input));
  }
});

test("focused retry always verifies source and runs the production navigation check", () => {
  const retry = parse(
    readFileSync(
      new URL(
        "../.github/workflows/worker-navigation-retry.yml",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(Object.keys(retry.on), ["workflow_dispatch"]);
  const steps = retry.jobs.navigation.steps;
  assert.equal(
    steps.find(
      (step) =>
        step.name === "Verify retained checks and unchanged application",
    ).run,
    "node scripts/verify-navigation-retry.mjs source",
  );
  assert.equal(
    steps.find(
      (step) => step.name === "Run production Worker navigation checks",
    ).run,
    "pnpm test:worker-navigation",
  );
  assert.ok(steps.every((step) => !step["continue-on-error"]));
});

test("every published service retains scanning and provenance before release evidence", () => {
  const jobs = workflow.jobs;
  assert.deepEqual(jobs["scan-images"].strategy.matrix.target, [
    "web",
    "api",
    "worker",
    "migrate",
  ]);
  assert.equal(jobs["scan-images"].needs, "build-images");
  assert.equal(jobs["attest-images"].needs, "scan-images");
  assert.equal(jobs["release-evidence"].needs, "attest-images");
  for (const name of ["scan-images", "attest-images"]) {
    assert.equal(jobs[name].env.SOURCE_SHA, "${{ github.sha }}");
  }
  const scan = jobs["scan-images"].steps.find((step) =>
    step.uses?.startsWith("anchore/scan-action@"),
  );
  assert.equal(scan.with["fail-build"], true);
  assert.equal(scan.with["severity-cutoff"], "high");
  assert.equal(jobs["scan-images"].permissions.packages, "read");
  const source = readFileSync(
    new URL(
      "../.github/workflows/publish-northflank-images.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /docker logout ghcr\.io/);
  assert.match(source, /deploymentPerformed: false/);
  assert.doesNotMatch(
    source,
    /NORTHFLANK_API_TOKEN|CLOUDFLARE_API_TOKEN|DATABASE_URL/,
  );
});
