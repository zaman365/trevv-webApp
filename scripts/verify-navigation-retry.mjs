import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// These files affect release orchestration only. Any application, dependency,
// migration, runtime or test-behavior change requires a new complete CI run.
export const retryOnlyFiles = new Set([
  ".github/workflows/worker-navigation-retry.yml",
  ".github/workflows/publish-northflank-images.yml",
  "scripts/verify-navigation-retry.mjs",
  "scripts/publish-northflank-images-workflow.test.mjs",
  "deploy/northflank/README.md",
]);

export function verifyRetainedChecks({ run, jobs, changedFiles, repository }) {
  assert.equal(run.path, ".github/workflows/ci.yml");
  assert.equal(run.head_repository?.full_name, repository);
  assert.equal(run.event, "push");
  assert.equal(run.status, "completed");
  assert.equal(run.conclusion, "failure");
  for (const name of [
    "quality",
    "accessibility",
    "live-identity",
    "staging-topology",
  ]) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing or duplicate ${name} result`);
    assert.equal(
      matches[0].conclusion,
      "success",
      `${name} must already have passed`,
    );
  }
  const browserJobs = jobs.filter((job) => job.name === "e2e");
  assert.equal(browserJobs.length, 1);
  const browser = browserJobs[0];
  assert.equal(browser.conclusion, "failure");
  for (const name of [
    "Run pnpm test:e2e",
    "Guard background refresh responsiveness",
  ]) {
    assert.equal(
      browser.steps.find((step) => step.name === name)?.conclusion,
      "success",
      `${name} must already have passed`,
    );
  }
  assert.deepEqual(
    browser.steps
      .filter((step) => step.conclusion === "failure")
      .map((step) => step.name),
    ["Guard production Worker navigation requests"],
  );
  for (const path of changedFiles) {
    assert.ok(
      retryOnlyFiles.has(path),
      `Cannot reuse checks after changing ${path}`,
    );
  }
  return {
    sourceCiRunId: run.id,
    sourceCiAttempt: run.run_attempt,
    sourceCiSha: run.head_sha,
    retainedChecks: [
      "quality",
      "accessibility",
      "live-identity",
      "staging-topology",
      "browser-workflows",
      "background-refresh",
    ],
    changedFiles,
  };
}

function gh(...args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8" }));
}

function checkedRepository(value) {
  assert.match(value, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  return value;
}

function validateSource() {
  const repository = checkedRepository(process.env.GITHUB_REPOSITORY);
  const id = process.env.SOURCE_CI_RUN_ID;
  assert.match(id, /^\d+$/);
  const sourceSha = process.env.GITHUB_SHA;
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceSha,
  );
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    "",
    "Retry source must be clean",
  );
  const run = gh("api", `repos/${repository}/actions/runs/${id}`);
  assert.match(run.head_sha, /^[a-f0-9]{40}$/);
  execFileSync("git", ["merge-base", "--is-ancestor", run.head_sha, sourceSha]);
  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", run.head_sha, sourceSha],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean);
  const result = gh(
    "api",
    `repos/${repository}/actions/runs/${id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  assert.equal(
    result.total_count,
    result.jobs.length,
    "Expected all source jobs in the response",
  );
  const evidence = {
    ...verifyRetainedChecks({
      run,
      jobs: result.jobs,
      changedFiles,
      repository,
    }),
    sourceSha,
    navigationRetryRequired: true,
  };
  writeFileSync(
    "navigation-retry-evidence.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}

function validatePublication() {
  const repository = checkedRepository(process.env.GITHUB_REPOSITORY);
  const sha = process.env.GITHUB_SHA;
  assert.match(sha, /^[a-f0-9]{40}$/);
  const result = gh(
    "api",
    `repos/${repository}/actions/workflows/worker-navigation-retry.yml/runs?head_sha=${sha}&status=completed&per_page=100`,
  );
  const candidates = result.workflow_runs.filter(
    (run) =>
      run.head_sha === sha &&
      run.event === "workflow_dispatch" &&
      run.conclusion === "success" &&
      run.path === ".github/workflows/worker-navigation-retry.yml" &&
      run.head_repository?.full_name === repository,
  );
  assert.ok(
    candidates.length,
    "No successful focused navigation retry for this exact source",
  );
  const run = candidates[0];
  const resultJobs = gh(
    "api",
    `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`,
  );
  assert.equal(resultJobs.total_count, 1);
  const job = resultJobs.jobs[0];
  assert.equal(job.name, "Worker navigation retry");
  assert.equal(job.conclusion, "success");
  for (const name of [
    "Verify retained checks and unchanged application",
    "Run production Worker navigation checks",
  ]) {
    assert.equal(
      job.steps.find((step) => step.name === name)?.conclusion,
      "success",
    );
  }
  console.log(
    JSON.stringify({
      sourceSha: sha,
      successfulNavigationRetry: run.id,
      retainedChecksVerified: true,
    }),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv[2] === "source") validateSource();
  else if (process.argv[2] === "publication") validatePublication();
  else throw new Error("Expected source or publication verification mode");
}
