import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { resolve } from "node:path";
import {
  readinessAuthorization,
  validateReadinessRegister,
} from "./phase6-readiness.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const register = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "release/phase6-readiness.json"),
    "utf8",
  ),
);

test("the complete Phase 6 register is valid and honestly NO_GO", () => {
  assert.deepEqual(
    validateReadinessRegister(register, {
      asOf: "2026-08-30",
      repositoryRoot,
    }),
    [],
  );
  const decision = readinessAuthorization(register, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.equal(decision.authorized, false);
  assert.ok(
    decision.blockers.some((entry) => entry.startsWith("P0-05 is open")),
  );
  assert.ok(
    decision.blockers.some((entry) => entry.startsWith("P1-03 is open")),
  );
  assert.ok(
    decision.blockers.includes("The register explicitly declares NO_GO."),
  );
});

test("missing findings and placeholder owners are rejected", () => {
  const changed = structuredClone(register);
  changed.findings = changed.findings.filter(
    (finding) => finding.id !== "P1-07",
  );
  changed.findings[0].ownerRole = "TBD";
  const errors = validateReadinessRegister(changed, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.ok(errors.includes("P0-01 has no accountable owner role."));
  assert.ok(errors.includes("Missing finding P1-07."));
});

test("stale deferrals cannot authorize a release", () => {
  const changed = structuredClone(register);
  const deferred = changed.findings.find((finding) => finding.id === "P2-04");
  deferred.reviewDate = "2026-08-29";
  const decision = readinessAuthorization(changed, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.equal(decision.authorized, false);
  assert.ok(
    decision.validationErrors.includes(
      "P2-04 has a stale deferred review date (2026-08-29).",
    ),
  );
});

test("register-owned status additions cannot waive a P0 or P1 blocker", () => {
  const changed = structuredClone(register);
  changed.releaseScope.decision = "GO";
  changed.allowedStatuses.P0.push("waived");
  const blocker = changed.findings.find((finding) => finding.id === "P0-05");
  blocker.status = "waived";

  const decision = readinessAuthorization(changed, {
    asOf: "2026-08-30",
    repositoryRoot,
  });

  assert.equal(decision.authorized, false);
  assert.ok(
    decision.validationErrors.includes(
      "allowedStatuses must exactly match the code-owned readiness policy.",
    ),
  );
  assert.ok(
    decision.validationErrors.includes("P0-05 has unsupported status waived."),
  );
  assert.ok(
    decision.blockers.includes(
      "P0-05 is waived: Complete production deployment topology",
    ),
  );
});

test("out-of-scope cannot bypass a release-blocking P0 or P1 finding", () => {
  const changed = structuredClone(register);
  changed.releaseScope.decision = "GO";
  const blocker = changed.findings.find((finding) => finding.id === "P1-03");
  blocker.status = "out_of_scope";

  const decision = readinessAuthorization(changed, {
    asOf: "2026-08-30",
    repositoryRoot,
  });

  assert.equal(decision.authorized, false);
  assert.ok(
    decision.blockers.includes(
      "P1-03 is out_of_scope: Approved and exercised billing lifecycle",
    ),
  );
});

test("Turbo propagates release-critical build environment into cached tasks", () => {
  const turboConfig = JSON.parse(
    readFileSync(resolve(repositoryRoot, "turbo.json"), "utf8"),
  );
  const releaseCriticalEnvironment = [
    "CSP_MODE",
    "HSTS_ENABLED",
    "NEXT_PUBLIC_RUM_ENABLED",
    "NEXT_PUBLIC_RUM_SAMPLE_RATE",
    "REGISTRATION_MODE",
  ];

  for (const variable of releaseCriticalEnvironment) {
    assert.ok(
      turboConfig.globalEnv.includes(variable),
      `${variable} must be forwarded to and invalidate Turbo build caches.`,
    );
  }
});
