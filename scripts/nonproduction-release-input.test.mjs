import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createNonProductionReleaseInput } from "./nonproduction-release-input.mjs";
import {
  createReleaseManifest,
  stableStringify,
  validateReleaseManifest,
} from "./phase6-release-manifest.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function previousManifest() {
  return createReleaseManifest(
    {
      releaseId: "rehearsal-previous",
      createdAt: "2026-08-29T12:00:00.000Z",
      gitSha: "a".repeat(40),
      imageDigests: {
        api: digest("1"),
        migrate: digest("2"),
        web: digest("3"),
        worker: digest("4"),
      },
      database: {
        previousReleaseMigrationHead: "0016_shared_api_rate_limits",
        strategy: "additive-forward-only",
      },
      runtimes: { node: "22.19.0", pnpm: "11.22.0" },
      securityModes: {
        demoMode: false,
        registrationMode: "invite_only",
        cspMode: "report-only",
        hstsEnabled: false,
        rateLimitBackend: "postgres",
        errorReportingMode: "disabled",
      },
      previousRelease: {
        releaseId: "rehearsal-bootstrap",
        manifestDigest: digest("5"),
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
    { worktreeStatus: "" },
  );
}

function candidateConfiguration() {
  return {
    releaseId: "rehearsal-candidate",
    createdAt: "2026-08-30T12:00:00.000Z",
    gitSha: "b".repeat(40),
    previousMigrationHead: "0016_shared_api_rate_limits",
    previousReleaseId: "rehearsal-previous",
    imageDigests: {
      api: digest("6"),
      migrate: digest("7"),
      web: digest("8"),
      worker: digest("9"),
    },
  };
}

test("non-production input is structurally valid and remains production NO_GO", () => {
  const previousText = `${stableStringify(previousManifest())}\n`;
  const input = createNonProductionReleaseInput(candidateConfiguration(), {
    previousManifestText: previousText,
  });
  const manifest = createReleaseManifest(input, { worktreeStatus: "" });

  assert.deepEqual(
    validateReleaseManifest(manifest, { repositoryRoot: null }),
    [],
  );
  const productionErrors = validateReleaseManifest(manifest, {
    forProduction: true,
    repositoryRoot: null,
    worktreeStatus: "",
  });
  assert.ok(
    productionErrors.includes("Production authorization is not explicit."),
  );
  assert.ok(
    productionErrors.includes(
      "Production authorization requires enforcing CSP.",
    ),
  );
  assert.ok(
    productionErrors.some((error) =>
      error.startsWith("Production authorization requires ci evidence."),
    ),
  );
});

test("non-production input requires an immutable previous manifest", () => {
  assert.throws(
    () =>
      createNonProductionReleaseInput(candidateConfiguration(), {
        previousManifestText: "{}",
      }),
    /Previous non-production manifest is invalid/u,
  );
  assert.throws(
    () =>
      createNonProductionReleaseInput(
        {
          ...candidateConfiguration(),
          imageDigests: {
            ...candidateConfiguration().imageDigests,
            worker: "latest",
          },
        },
        { previousManifestText: `${stableStringify(previousManifest())}\n` },
      ),
    /worker image ID must be an immutable sha256 digest/u,
  );
});

test("synthetic SQL is guarded and contains only reserved test identities", () => {
  const fixture = readFileSync(
    new URL(
      "../release/fixtures/synthetic-production-v0004.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(fixture, /Classification: synthetic non-production data/u);
  assert.match(fixture, /current_database\(\).*_synthetic_rehearsal/su);
  const emails = [...fixture.matchAll(/'([^']+@[^']+)'/gu)].map(
    (match) => match[1],
  );
  assert.equal(emails.length, 4);
  assert.ok(emails.every((email) => email.endsWith("@trevv.test")));
  assert.ok(!fixture.includes("encrypted_credentials"));
  assert.ok(!fixture.includes("token_hash"));
});

test("smoke checklist is complete-by-default NO_GO", () => {
  const checklist = JSON.parse(
    readFileSync(
      new URL(
        "../release/nonproduction-smoke-checklist.template.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(checklist.template, true);
  assert.equal(checklist.classification, "synthetic-non-production");
  assert.equal(checklist.releaseDecision, "NO_GO");
  assert.ok(checklist.checks.length >= 25);
  assert.equal(
    new Set(checklist.checks.map((check) => check.id)).size,
    checklist.checks.length,
  );
  assert.ok(
    checklist.checks.every(
      (check) => check.required === true && check.result === "not_run",
    ),
  );
});
