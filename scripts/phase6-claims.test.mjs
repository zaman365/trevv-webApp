import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  claimsAuthorization,
  requiredForbiddenPatterns,
  requiredPublicSurfaceFiles,
  validateClaimsInventory,
} from "./phase6-claims.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const inventory = JSON.parse(
  readFileSync(
    resolve(repositoryRoot, "release/marketing-claims.json"),
    "utf8",
  ),
);

test("the claims inventory is valid and blocks unsupported public claims", () => {
  assert.deepEqual(
    validateClaimsInventory(inventory, { asOf: "2026-08-30", repositoryRoot }),
    [],
  );
  const decision = claimsAuthorization(inventory, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.equal(decision.authorized, false);
  assert.ok(
    decision.blockers.some((entry) =>
      entry.startsWith("CLAIM-008 is prohibited"),
    ),
  );
  assert.ok(
    decision.blockers.some((entry) => entry.startsWith("CLAIM-014 is draft")),
  );
});

test("prohibited and draft claims can never be marked for public use", () => {
  for (const status of ["prohibited", "draft"]) {
    const changed = structuredClone(inventory);
    const claim = changed.claims.find((entry) => entry.status === status);
    claim.publicUse = true;
    const errors = validateClaimsInventory(changed, {
      asOf: "2026-08-30",
      repositoryRoot,
    });
    assert.ok(
      errors.some((entry) =>
        entry.includes(`cannot be public while its status is ${status}`),
      ),
    );
  }
});

test("stale claim review dates fail validation", () => {
  const changed = structuredClone(inventory);
  changed.claims[0].reviewDate = "2026-08-29";
  assert.ok(
    validateClaimsInventory(changed, {
      asOf: "2026-08-30",
      repositoryRoot,
    }).includes("CLAIM-001 has a stale review date (2026-08-29)."),
  );
});

test("required disclosures cannot be hidden or left without a source", () => {
  const hidden = structuredClone(inventory);
  const disclosure = hidden.claims.find(
    (claim) => claim.status === "required_disclosure",
  );
  disclosure.publicUse = false;
  disclosure.sourceLocations = [];
  const errors = validateClaimsInventory(hidden, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.ok(
    errors.includes(
      `${disclosure.id} is a required disclosure and must be public.`,
    ),
  );
  assert.ok(
    errors.includes(
      `${disclosure.id} must name a public disclosure source location.`,
    ),
  );
});

test("forbidden claim wording is crawled across declared public surfaces", () => {
  const changed = structuredClone(inventory);
  changed.publicSurfacePolicy.forbiddenPatterns[0] = {
    claimId: "CLAIM-014",
    pattern: "TREVV",
    flags: "u",
  };
  const errors = validateClaimsInventory(changed, {
    asOf: "2026-08-30",
    repositoryRoot,
  });
  assert.ok(
    errors.some((entry) =>
      entry.startsWith(
        "CLAIM-014 forbidden wording appears in public surface ",
      ),
    ),
  );
});

test("the mutable inventory cannot shrink or replace the canonical public-surface crawl", () => {
  for (const mutate of [
    (changed) => changed.publicSurfacePolicy.files.pop(),
    (changed) => {
      changed.publicSurfacePolicy.files[0] = "apps/web/app/page.tsx";
    },
  ]) {
    const changed = structuredClone(inventory);
    mutate(changed);
    const errors = validateClaimsInventory(changed, {
      asOf: "2026-08-30",
      repositoryRoot,
    });
    assert.ok(
      errors.some((entry) =>
        entry.startsWith(
          "publicSurfacePolicy.files is missing required entry:",
        ),
      ),
    );
  }
  assert.deepEqual(inventory.publicSurfacePolicy.files, [
    ...requiredPublicSurfaceFiles,
  ]);
});

test("every prohibited or draft claim keeps its canonical wording guard", () => {
  const protectedClaimIds = inventory.claims
    .filter((claim) => ["prohibited", "draft"].includes(claim.status))
    .map((claim) => claim.id)
    .sort();
  const guardedClaimIds = [
    ...new Set(requiredForbiddenPatterns.map((entry) => entry.claimId)),
  ].filter((claimId) => protectedClaimIds.includes(claimId));
  assert.deepEqual(guardedClaimIds.sort(), protectedClaimIds);

  for (const mutate of [
    (changed) => changed.publicSurfacePolicy.forbiddenPatterns.pop(),
    (changed) => {
      changed.publicSurfacePolicy.forbiddenPatterns[0].pattern = "harmless";
    },
  ]) {
    const changed = structuredClone(inventory);
    mutate(changed);
    const errors = validateClaimsInventory(changed, {
      asOf: "2026-08-30",
      repositoryRoot,
    });
    assert.ok(
      errors.some((entry) =>
        entry.startsWith(
          "publicSurfacePolicy.forbiddenPatterns is missing required entry:",
        ),
      ),
    );
  }
});
