#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, "..");
const statuses = new Set([
  "approved_scoped",
  "required_disclosure",
  "prohibited",
  "draft",
]);
const placeholderOwner = /^(?:unassigned|unknown|none|n\/a|tbd|todo)$/iu;

// Keep the crawl boundary outside the mutable claims inventory. A release
// author must update this reviewed policy and its regression tests when a new
// public claim surface or prohibited wording category is introduced; deleting
// an entry from marketing-claims.json cannot silently weaken the gate.
export const requiredPublicSurfaceFiles = Object.freeze([
  "README.md",
  "apps/web/app/layout.tsx",
  "apps/web/app/manifest.ts",
  "apps/web/app/privacy/page.tsx",
  "apps/web/app/terms/page.tsx",
  "apps/web/lib/product-copy.ts",
  "apps/web/components/auth-experience.tsx",
  "apps/web/components/capability-status.tsx",
]);

export const requiredForbiddenPatterns = Object.freeze([
  {
    claimId: "CLAIM-008",
    pattern:
      "(?:\\b99\\.9% (?:available|availability)\\b|\\bactive production SLO\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-009",
    pattern:
      "(?:\\bGDPR compliant\\b|\\bindependently secure\\b|\\bpenetration-tested\\b|\\bcertified\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-011",
    pattern: "English/German",
    flags: "iu",
  },
  {
    claimId: "CLAIM-012",
    pattern: "\\bend-to-end encrypted\\b",
    flags: "iu",
  },
  {
    claimId: "CLAIM-013",
    pattern:
      "(?:\\bAI autonomously runs?\\b|\\bAI (?:performs?|executes?) external actions?\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-014",
    pattern: "Everything you run\\. One clear view\\.",
    flags: "iu",
  },
  {
    claimId: "CLAIM-015",
    pattern: "\\bfounder operating system\\b",
    flags: "iu",
  },
  {
    claimId: "CLAIM-016",
    pattern:
      "(?:\\bworks offline with private customer data\\b|\\bqueued offline writes?\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-017",
    pattern:
      "(?:\\bpublic registration is (?:available|open)\\b|\\bno-card trial\\b|\\bFounder plan is available\\b|\\bStartup plan is available\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-018",
    pattern:
      "(?:\\bloads? in under two seconds\\b|\\bsub-two-second (?:Portfolio|load)\\b)",
    flags: "iu",
  },
  {
    claimId: "CLAIM-019",
    pattern:
      "(?:customer export|account deletion|retention enforcement|provider revocation)[^\\n]{0,120}\\b(?:is|are) complete\\b",
    flags: "iu",
  },
  {
    claimId: "CLAIM-020",
    pattern: "No production-critical demo fallback remains\\.",
    flags: "iu",
  },
]);

export function validateClaimsInventory(
  inventory,
  {
    asOf = new Date().toISOString().slice(0, 10),
    repositoryRoot = defaultRepositoryRoot,
    checkEvidencePaths = true,
  } = {},
) {
  const errors = [];
  if (!inventory || typeof inventory !== "object")
    return ["Claims inventory must be an object."];
  if (inventory.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (!new Set(["GO", "NO_GO"]).has(inventory.decision))
    errors.push("decision must be GO or NO_GO.");
  if (!Array.isArray(inventory.claims) || inventory.claims.length === 0)
    return [...errors, "claims must be a non-empty array."];
  validatePublicSurfacePolicy(
    inventory.publicSurfacePolicy,
    errors,
    repositoryRoot,
    checkEvidencePaths,
    inventory.claims,
  );
  const seen = new Set();
  for (const claim of inventory.claims) {
    const id = claim?.id;
    if (typeof id !== "string" || !/^CLAIM-\d{3}$/u.test(id)) {
      errors.push(`Invalid claim id: ${String(id)}.`);
      continue;
    }
    if (seen.has(id)) errors.push(`Duplicate claim id: ${id}.`);
    seen.add(id);
    if (!statuses.has(claim.status))
      errors.push(`${id} has unsupported status ${String(claim.status)}.`);
    for (const field of ["claim", "scope", "limitations", "ownerRole"]) {
      if (typeof claim[field] !== "string" || claim[field].trim().length < 3)
        errors.push(`${id}.${field} is required.`);
    }
    if (placeholderOwner.test(String(claim.ownerRole).trim()))
      errors.push(`${id} has no accountable owner role.`);
    if (!isDate(claim.reviewDate))
      errors.push(`${id}.reviewDate must be an ISO date.`);
    else if (claim.reviewDate < asOf)
      errors.push(`${id} has a stale review date (${claim.reviewDate}).`);
    if (typeof claim.publicUse !== "boolean")
      errors.push(`${id}.publicUse must be boolean.`);
    if (typeof claim.releaseBlocker !== "boolean")
      errors.push(`${id}.releaseBlocker must be boolean.`);
    if (
      claim.publicUse &&
      !new Set(["approved_scoped", "required_disclosure"]).has(claim.status)
    )
      errors.push(
        `${id} cannot be public while its status is ${claim.status}.`,
      );
    if (claim.status === "prohibited" && claim.publicUse)
      errors.push(`${id} is prohibited and cannot be public.`);
    if (claim.status === "required_disclosure" && claim.publicUse !== true)
      errors.push(`${id} is a required disclosure and must be public.`);
    if (!Array.isArray(claim.sourceLocations))
      errors.push(`${id}.sourceLocations must be an array.`);
    else {
      if (
        claim.status === "required_disclosure" &&
        claim.sourceLocations.length === 0
      )
        errors.push(`${id} must name a public disclosure source location.`);
      for (const source of claim.sourceLocations)
        validatePath(
          source,
          `${id}.sourceLocations`,
          errors,
          repositoryRoot,
          checkEvidencePaths,
        );
    }
    if (!Array.isArray(claim.evidence) || claim.evidence.length === 0)
      errors.push(`${id} must cite evidence.`);
    else
      for (const [index, evidence] of claim.evidence.entries()) {
        validatePath(
          evidence?.path,
          `${id}.evidence[${index}]`,
          errors,
          repositoryRoot,
          checkEvidencePaths,
        );
        if (
          typeof evidence?.detail !== "string" ||
          evidence.detail.trim().length < 8
        )
          errors.push(`${id}.evidence[${index}].detail is required.`);
      }
  }
  return errors;
}

function validatePublicSurfacePolicy(
  policy,
  errors,
  repositoryRoot,
  checkPaths,
  claims,
) {
  if (!policy || typeof policy !== "object") {
    errors.push("publicSurfacePolicy is required.");
    return;
  }
  if (!Array.isArray(policy.files) || policy.files.length === 0) {
    errors.push("publicSurfacePolicy.files must be a non-empty array.");
    return;
  }
  if (
    !Array.isArray(policy.forbiddenPatterns) ||
    policy.forbiddenPatterns.length === 0
  ) {
    errors.push(
      "publicSurfacePolicy.forbiddenPatterns must be a non-empty array.",
    );
    return;
  }
  validateExactPolicyEntries(
    "publicSurfacePolicy.files",
    policy.files,
    requiredPublicSurfaceFiles,
    (entry) => String(entry),
    errors,
  );
  validateExactPolicyEntries(
    "publicSurfacePolicy.forbiddenPatterns",
    policy.forbiddenPatterns,
    requiredForbiddenPatterns,
    patternKey,
    errors,
  );
  const protectedClaimIds = new Set(
    (claims ?? [])
      .filter((claim) => new Set(["prohibited", "draft"]).has(claim?.status))
      .map((claim) => claim.id),
  );
  const coveredClaimIds = new Set(
    requiredForbiddenPatterns.map((entry) => entry.claimId),
  );
  for (const claimId of protectedClaimIds)
    if (!coveredClaimIds.has(claimId))
      errors.push(
        `${claimId} is ${claims.find((claim) => claim?.id === claimId)?.status} but has no canonical forbidden-wording policy.`,
      );
  const resolvedFiles = [];
  for (const file of policy.files) {
    validatePath(
      file,
      "publicSurfacePolicy.files",
      errors,
      repositoryRoot,
      checkPaths,
    );
    if (typeof file === "string" && !isAbsolute(file))
      resolvedFiles.push({ file, path: resolve(repositoryRoot, file) });
  }
  for (const [index, entry] of policy.forbiddenPatterns.entries()) {
    if (typeof entry?.claimId !== "string") {
      errors.push(
        `publicSurfacePolicy.forbiddenPatterns[${index}].claimId is required.`,
      );
      continue;
    }
    let expression;
    try {
      expression = new RegExp(entry.pattern, entry.flags);
    } catch {
      errors.push(
        `publicSurfacePolicy.forbiddenPatterns[${index}] is not a valid regular expression.`,
      );
      continue;
    }
    if (!checkPaths) continue;
    for (const source of resolvedFiles) {
      if (
        existsSync(source.path) &&
        expression.test(readFileSync(source.path, "utf8"))
      )
        errors.push(
          `${entry.claimId} forbidden wording appears in public surface ${source.file}.`,
        );
      expression.lastIndex = 0;
    }
  }
}

function validateExactPolicyEntries(label, actual, required, key, errors) {
  const actualKeys = actual.map(key);
  const requiredKeys = required.map(key);
  const actualSet = new Set(actualKeys);
  const requiredSet = new Set(requiredKeys);
  for (const requiredKey of requiredSet)
    if (!actualSet.has(requiredKey))
      errors.push(`${label} is missing required entry: ${requiredKey}.`);
  for (const actualKey of actualSet)
    if (!requiredSet.has(actualKey))
      errors.push(`${label} contains unreviewed entry: ${actualKey}.`);
  if (actualKeys.length !== actualSet.size)
    errors.push(`${label} cannot contain duplicate entries.`);
}

function patternKey(entry) {
  return `${String(entry?.claimId)}\u0000${String(entry?.pattern)}\u0000${String(entry?.flags)}`;
}

export function claimsAuthorization(inventory, options = {}) {
  const validationErrors = validateClaimsInventory(inventory, options);
  const blockers = validationErrors.map((message) => `INVALID: ${message}`);
  for (const claim of inventory?.claims ?? []) {
    if (
      claim.releaseBlocker &&
      !new Set(["approved_scoped", "required_disclosure"]).has(claim.status)
    )
      blockers.push(`${claim.id} is ${claim.status}: ${claim.claim}`);
  }
  if (inventory?.decision !== "GO")
    blockers.push("The claims inventory explicitly declares NO_GO.");
  return { authorized: blockers.length === 0, blockers, validationErrors };
}

function validatePath(
  value,
  label,
  errors,
  repositoryRoot,
  checkEvidencePaths,
) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${label} contains a missing path.`);
    return;
  }
  if (isAbsolute(value) || value.split(/[\\/]/u).includes("..")) {
    errors.push(`${label} must stay repository-relative: ${value}.`);
    return;
  }
  if (checkEvidencePaths && !existsSync(resolve(repositoryRoot, value)))
    errors.push(`${label} does not exist: ${value}.`);
}

function isDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1]) throw new Error(`${name} requires a value.`);
  return args[index + 1];
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] ?? "validate";
  if (!new Set(["validate", "authorize"]).has(command))
    throw new Error(
      "Usage: phase6-claims.mjs <validate|authorize> [--inventory path] [--as-of YYYY-MM-DD]",
    );
  const repositoryRoot = resolve(
    option(args, "--repo-root", defaultRepositoryRoot),
  );
  const inventoryPath = resolve(
    repositoryRoot,
    option(args, "--inventory", "release/marketing-claims.json"),
  );
  const asOf = option(args, "--as-of", new Date().toISOString().slice(0, 10));
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  const decision = claimsAuthorization(inventory, { asOf, repositoryRoot });
  if (decision.validationErrors.length) {
    console.error(
      decision.validationErrors.map((error) => `ERROR ${error}`).join("\n"),
    );
    process.exitCode = 1;
    return;
  }
  if (command === "authorize" && !decision.authorized) {
    console.error(
      `NO_GO\n${decision.blockers.map((entry) => `- ${entry}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    command === "authorize"
      ? "GO"
      : `Claims inventory is structurally valid. Decision: ${decision.authorized ? "GO" : "NO_GO"}.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
