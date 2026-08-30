#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepositoryRoot = resolve(scriptDirectory, "..");
const expectedIds = {
  P0: Array.from(
    { length: 11 },
    (_, index) => `P0-${String(index + 1).padStart(2, "0")}`,
  ),
  P1: Array.from(
    { length: 7 },
    (_, index) => `P1-${String(index + 1).padStart(2, "0")}`,
  ),
  P2: Array.from(
    { length: 5 },
    (_, index) => `P2-${String(index + 1).padStart(2, "0")}`,
  ),
  P3: Array.from(
    { length: 7 },
    (_, index) => `P3-${String(index + 1).padStart(2, "0")}`,
  ),
};
const allowedStatuses = Object.freeze({
  P0: Object.freeze(["closed", "partial", "open", "out_of_scope"]),
  P1: Object.freeze(["closed", "partial", "open", "out_of_scope"]),
  P2: Object.freeze(["closed", "accepted", "deferred"]),
  P3: Object.freeze(["closed", "accepted", "deferred"]),
});
const placeholderOwner = /^(?:unassigned|unknown|none|n\/a|tbd|todo)$/iu;

export function loadReadinessRegister(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validateReadinessRegister(
  register,
  {
    asOf = new Date().toISOString().slice(0, 10),
    repositoryRoot = defaultRepositoryRoot,
    checkEvidencePaths = true,
  } = {},
) {
  const errors = [];
  if (!register || typeof register !== "object")
    return ["The readiness register must be a JSON object."];
  if (register.schemaVersion !== 1) errors.push("schemaVersion must equal 1.");
  if (!isDate(register.asOf)) errors.push("asOf must be an ISO calendar date.");
  if (!isDate(asOf))
    errors.push("The validation as-of value must be an ISO calendar date.");
  if (
    register.releaseScope?.decision !== "NO_GO" &&
    register.releaseScope?.decision !== "GO"
  )
    errors.push("releaseScope.decision must be GO or NO_GO.");
  if (!matchesAllowedStatusPolicy(register.allowedStatuses))
    errors.push(
      "allowedStatuses must exactly match the code-owned readiness policy.",
    );
  if (!Array.isArray(register.findings)) {
    errors.push("findings must be an array.");
    return errors;
  }

  const seen = new Set();
  for (const finding of register.findings) {
    const prefix =
      typeof finding?.id === "string" ? finding.id.slice(0, 2) : "";
    if (!Object.hasOwn(expectedIds, prefix)) {
      errors.push(`Unknown or missing finding id: ${String(finding?.id)}.`);
      continue;
    }
    if (seen.has(finding.id))
      errors.push(`Duplicate finding id: ${finding.id}.`);
    seen.add(finding.id);

    const allowed = allowedStatuses[prefix];
    if (!allowed.includes(finding.status))
      errors.push(
        `${finding.id} has unsupported status ${String(finding.status)}.`,
      );
    if (typeof finding.title !== "string" || finding.title.trim().length < 5)
      errors.push(`${finding.id} must have a descriptive title.`);
    if (!validOwner(finding.ownerRole))
      errors.push(`${finding.id} has no accountable owner role.`);
    if (!isDate(finding.targetDate))
      errors.push(`${finding.id} must have an ISO targetDate.`);
    if (!isDate(finding.reviewDate))
      errors.push(`${finding.id} must have an ISO reviewDate.`);
    if (
      typeof finding.rationale !== "string" ||
      finding.rationale.trim().length < 20
    )
      errors.push(`${finding.id} must include a substantive rationale.`);
    if (typeof finding.releaseBlocker !== "boolean")
      errors.push(`${finding.id}.releaseBlocker must be boolean.`);
    if (!Array.isArray(finding.evidence) || finding.evidence.length === 0) {
      errors.push(`${finding.id} must cite evidence.`);
    } else {
      for (const [index, evidence] of finding.evidence.entries()) {
        const label = `${finding.id}.evidence[${index}]`;
        if (typeof evidence?.path !== "string" || evidence.path.trim() === "") {
          errors.push(`${label}.path is required.`);
          continue;
        }
        if (
          isAbsolute(evidence.path) ||
          evidence.path.split(/[\\/]/u).includes("..")
        )
          errors.push(`${label}.path must stay repository-relative.`);
        else if (
          checkEvidencePaths &&
          !existsSync(resolve(repositoryRoot, evidence.path))
        )
          errors.push(`${label}.path does not exist: ${evidence.path}.`);
        if (
          typeof evidence.detail !== "string" ||
          evidence.detail.trim().length < 8
        )
          errors.push(`${label}.detail is required.`);
      }
    }

    if (
      (finding.status === "deferred" ||
        finding.status === "accepted" ||
        finding.status === "out_of_scope") &&
      isDate(finding.reviewDate) &&
      finding.reviewDate < asOf
    ) {
      errors.push(
        `${finding.id} has a stale ${finding.status} review date (${finding.reviewDate}).`,
      );
    }
  }

  for (const ids of Object.values(expectedIds)) {
    for (const id of ids)
      if (!seen.has(id)) errors.push(`Missing finding ${id}.`);
  }

  const unknownIds = [...seen].filter(
    (id) => !Object.values(expectedIds).some((ids) => ids.includes(id)),
  );
  for (const id of unknownIds) errors.push(`Unexpected finding ${id}.`);

  return errors;
}

export function readinessAuthorization(register, options = {}) {
  const validationErrors = validateReadinessRegister(register, options);
  const blockers = [];
  if (validationErrors.length)
    blockers.push(...validationErrors.map((message) => `INVALID: ${message}`));
  if (Array.isArray(register?.findings)) {
    for (const finding of register.findings) {
      const priority =
        typeof finding.id === "string" ? finding.id.slice(0, 2) : "";
      if (finding.releaseBlocker && finding.status !== "closed") {
        if (["P0", "P1"].includes(priority))
          blockers.push(`${finding.id} is ${finding.status}: ${finding.title}`);
        else
          blockers.push(`${finding.id} remains a GA blocker: ${finding.title}`);
      } else if (
        ["P0", "P1"].includes(priority) &&
        ["open", "partial"].includes(finding.status)
      )
        blockers.push(`${finding.id} is ${finding.status}: ${finding.title}`);
    }
  }
  if (register?.releaseScope?.decision !== "GO")
    blockers.push("The register explicitly declares NO_GO.");
  return { authorized: blockers.length === 0, blockers, validationErrors };
}

function validOwner(value) {
  return (
    typeof value === "string" &&
    value.trim().length >= 3 &&
    !placeholderOwner.test(value.trim())
  );
}

function matchesAllowedStatusPolicy(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prefixes = Object.keys(allowedStatuses);
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...prefixes].sort())
  )
    return false;
  return prefixes.every(
    (prefix) =>
      Array.isArray(value[prefix]) &&
      value[prefix].length === allowedStatuses[prefix].length &&
      value[prefix].every(
        (status, index) => status === allowedStatuses[prefix][index],
      ),
  );
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
      "Usage: phase6-readiness.mjs <validate|authorize> [--register path] [--as-of YYYY-MM-DD]",
    );
  const repositoryRoot = resolve(
    option(args, "--repo-root", defaultRepositoryRoot),
  );
  const registerPath = resolve(
    repositoryRoot,
    option(args, "--register", "release/phase6-readiness.json"),
  );
  const asOf = option(args, "--as-of", new Date().toISOString().slice(0, 10));
  const register = loadReadinessRegister(registerPath);
  const errors = validateReadinessRegister(register, { asOf, repositoryRoot });
  if (errors.length) {
    console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
    process.exitCode = 1;
    return;
  }
  const authorization = readinessAuthorization(register, {
    asOf,
    repositoryRoot,
  });
  if (command === "authorize" && !authorization.authorized) {
    console.error(
      `NO_GO\n${authorization.blockers.map((entry) => `- ${entry}`).join("\n")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    command === "authorize"
      ? "GO"
      : `Readiness register is structurally valid. Decision: ${authorization.authorized ? "GO" : "NO_GO"}.`,
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
