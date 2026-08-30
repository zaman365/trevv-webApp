#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  stableStringify,
  validateReleaseManifest,
} from "./phase6-release-manifest.mjs";

const digestPattern = /^sha256:[a-f0-9]{64}$/u;
const gitShaPattern = /^[a-f0-9]{40}$/u;
const migrationPattern = /^\d{4}_[a-z0-9_]+$/u;
const releaseIdPattern = /^rehearsal-[a-z0-9][a-z0-9._+-]{0,110}$/u;

export function createNonProductionReleaseInput(
  configuration,
  { previousManifestText } = {},
) {
  const releaseId = String(configuration.releaseId ?? "");
  if (!releaseIdPattern.test(releaseId))
    throw new Error("Non-production releaseId must start with rehearsal-.");
  if (!Number.isFinite(Date.parse(configuration.createdAt)))
    throw new Error("createdAt must be an ISO timestamp.");
  if (!gitShaPattern.test(String(configuration.gitSha ?? "")))
    throw new Error("gitSha must be a full lowercase Git SHA.");
  if (!migrationPattern.test(String(configuration.previousMigrationHead ?? "")))
    throw new Error("previousMigrationHead is invalid.");

  for (const service of ["api", "migrate", "web", "worker"])
    if (
      !digestPattern.test(String(configuration.imageDigests?.[service] ?? ""))
    )
      throw new Error(
        `${service} image ID must be an immutable sha256 digest.`,
      );

  if (
    typeof previousManifestText !== "string" ||
    previousManifestText.length === 0
  )
    throw new Error("A previous non-production manifest is required.");
  const previousManifest = JSON.parse(previousManifestText);
  const previousErrors = validateReleaseManifest(previousManifest, {
    repositoryRoot: null,
  });
  if (previousErrors.length > 0)
    throw new Error(
      `Previous non-production manifest is invalid: ${previousErrors.join(" ")}`,
    );
  if (previousManifest.releaseId !== configuration.previousReleaseId)
    throw new Error("previousReleaseId does not match the supplied manifest.");

  return {
    schemaVersion: 1,
    template: false,
    releaseId,
    createdAt: configuration.createdAt,
    gitSha: configuration.gitSha,
    imageDigests: {
      api: configuration.imageDigests.api,
      migrate: configuration.imageDigests.migrate,
      web: configuration.imageDigests.web,
      worker: configuration.imageDigests.worker,
    },
    database: {
      previousReleaseMigrationHead: configuration.previousMigrationHead,
      strategy: "additive-forward-only",
    },
    runtimes: {
      node: configuration.nodeVersion ?? "22.19.0",
      pnpm: configuration.pnpmVersion ?? "11.22.0",
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
      releaseId: previousManifest.releaseId,
      manifestDigest: rawDigest(previousManifestText),
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
  };
}

function rawDigest(content) {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function cliConfiguration() {
  const previousManifestPath = required("REHEARSAL_PREVIOUS_MANIFEST_PATH");
  return {
    configuration: {
      releaseId: required("REHEARSAL_RELEASE_ID"),
      createdAt: required("REHEARSAL_CREATED_AT"),
      gitSha: required("REHEARSAL_GIT_SHA"),
      previousMigrationHead: required("REHEARSAL_PREVIOUS_MIGRATION_HEAD"),
      previousReleaseId: required("REHEARSAL_PREVIOUS_RELEASE_ID"),
      imageDigests: {
        api: required("TREV_API_IMAGE_ID"),
        migrate: required("TREV_MIGRATE_IMAGE_ID"),
        web: required("TREV_WEB_IMAGE_ID"),
        worker: required("TREV_WORKER_IMAGE_ID"),
      },
    },
    previousManifestText: readFileSync(previousManifestPath, "utf8"),
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const { configuration, previousManifestText } = cliConfiguration();
  const input = createNonProductionReleaseInput(configuration, {
    previousManifestText,
  });
  process.stdout.write(`${stableStringify(input)}\n`);
}
