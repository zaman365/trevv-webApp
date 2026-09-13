import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "yaml";

const workflow = parse(
  readFileSync(
    new URL(
      "../.github/workflows/publish-northflank-images.yml",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("Northflank publication requires complete CI on the exact selected commit", () => {
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  const source = workflow.jobs["verify-source"];
  const gate = source.steps.find((step) => step.id === "source").run;
  assert.match(gate, /git rev-parse HEAD/);
  assert.match(gate, /head_sha=\$\{GITHUB_SHA\}/);
  assert.match(gate, /\.conclusion == "success"/);
  assert.match(gate, /test "\$successful_runs" -ge 1/);
  assert.equal(workflow.jobs["build-images"].needs, "verify-source");
});

test("every published service retains scanning and provenance before release evidence", () => {
  const jobs = workflow.jobs;
  assert.deepEqual(jobs["scan-images"].strategy.matrix.target, [
    "web",
    "api",
    "worker",
    "migrate",
  ]);
  assert.deepEqual(jobs["attest-images"].needs, [
    "verify-source",
    "scan-images",
  ]);
  assert.deepEqual(jobs["release-evidence"].needs, [
    "verify-source",
    "attest-images",
  ]);
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
