import { validatePostgresDatabaseUrl } from "@founderhq/db";
import { isIP } from "node:net";

export interface WorkerRuntimeConfiguration {
  databaseUrl: string;
  workerId: string;
  enabled: boolean;
  disabledHandlerNames: readonly string[];
  pollIntervalMs: number;
  attentionSweepIntervalMs: number;
  telemetryIntervalMs: number;
  readinessMaxStalenessMs: number;
  readinessMaxReadyAgeMs: number;
  readinessMaxUnsupportedAgeMs: number;
  readinessMaxDeadLetters: number;
  batchSize: number;
  concurrency: number;
  leaseMs: number;
  maxAttempts: number;
  healthHost: string;
  healthPort: number;
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function readWorkerRuntimeConfiguration(
  environment: RuntimeEnvironment = process.env,
  handlerNames: readonly string[] = ["attention", "audit", "collaboration"],
): WorkerRuntimeConfiguration {
  const nodeEnvironment = required(environment, "NODE_ENV");
  if (!new Set(["development", "test", "production"]).has(nodeEnvironment))
    throw new Error(
      "NODE_ENV must be explicitly set to development, test, or production.",
    );
  if (environment.DEMO_MODE?.trim() !== "false")
    throw new Error("The worker requires DEMO_MODE=false.");
  const databaseUrl = required(environment, "DATABASE_URL");
  const production = nodeEnvironment === "production";
  validatePostgresDatabaseUrl(databaseUrl, { production });

  const pollIntervalMs = environmentInteger(
    environment.WORKER_POLL_INTERVAL_MS,
    1_000,
    100,
    60_000,
    "WORKER_POLL_INTERVAL_MS",
  );
  const telemetryIntervalMs = environmentInteger(
    environment.WORKER_TELEMETRY_INTERVAL_MS,
    30_000,
    1_000,
    3_600_000,
    "WORKER_TELEMETRY_INTERVAL_MS",
  );

  return {
    databaseUrl,
    workerId: normalizeWorkerId(required(environment, "WORKER_ID")),
    enabled: optionalBoolean(environment, "WORKER_ENABLED", true),
    disabledHandlerNames: disabledHandlers(
      environment.WORKER_DISABLED_HANDLERS,
      handlerNames,
    ),
    pollIntervalMs,
    attentionSweepIntervalMs: environmentInteger(
      environment.WORKER_ATTENTION_SWEEP_INTERVAL_MS,
      60_000,
      1_000,
      3_600_000,
      "WORKER_ATTENTION_SWEEP_INTERVAL_MS",
    ),
    telemetryIntervalMs,
    readinessMaxStalenessMs: environmentInteger(
      environment.WORKER_READINESS_MAX_STALENESS_MS,
      Math.max(30_000, pollIntervalMs * 3, telemetryIntervalMs * 2),
      1_000,
      7_200_000,
      "WORKER_READINESS_MAX_STALENESS_MS",
    ),
    readinessMaxReadyAgeMs: environmentInteger(
      environment.WORKER_READINESS_MAX_READY_AGE_MS,
      300_000,
      1_000,
      86_400_000,
      "WORKER_READINESS_MAX_READY_AGE_MS",
    ),
    readinessMaxUnsupportedAgeMs: environmentInteger(
      environment.WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS,
      300_000,
      1_000,
      86_400_000,
      "WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS",
    ),
    readinessMaxDeadLetters: environmentInteger(
      environment.WORKER_READINESS_MAX_DEAD_LETTERS,
      0,
      0,
      1_000_000,
      "WORKER_READINESS_MAX_DEAD_LETTERS",
    ),
    batchSize: environmentInteger(
      environment.WORKER_BATCH_SIZE,
      5,
      1,
      10,
      "WORKER_BATCH_SIZE",
    ),
    concurrency: environmentInteger(
      environment.WORKER_CONCURRENCY,
      5,
      1,
      10,
      "WORKER_CONCURRENCY",
    ),
    leaseMs: environmentInteger(
      environment.WORKER_LEASE_MS,
      30_000,
      1_000,
      300_000,
      "WORKER_LEASE_MS",
    ),
    maxAttempts: environmentInteger(
      environment.WORKER_MAX_ATTEMPTS,
      8,
      1,
      50,
      "WORKER_MAX_ATTEMPTS",
    ),
    healthHost: healthHost(environment.WORKER_HEALTH_HOST ?? "127.0.0.1"),
    healthPort: environmentInteger(
      environment.WORKER_HEALTH_PORT,
      9_090,
      1,
      65_535,
      "WORKER_HEALTH_PORT",
    ),
  };
}

function required(environment: RuntimeEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalBoolean(
  environment: RuntimeEnvironment,
  name: string,
  fallback: boolean,
): boolean {
  const value = environment[name]?.trim();
  if (!value) return fallback;
  if (value !== "true" && value !== "false")
    throw new Error(`${name} must be explicitly true or false.`);
  return value === "true";
}

function environmentInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(
      `${label} must be an integer from ${minimum} to ${maximum}.`,
    );
  return parsed;
}

function normalizeWorkerId(value: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{2,127}$/iu.test(value))
    throw new Error("WORKER_ID must be 3-128 URL-safe characters.");
  return value;
}

function disabledHandlers(
  value: string | undefined,
  availableNames: readonly string[],
): readonly string[] {
  const available = new Set(availableNames);
  const disabled = [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].sort();
  for (const name of disabled)
    if (!available.has(name))
      throw new Error(`Unknown disabled worker handler “${name}”.`);
  return disabled;
}

function healthHost(value: string): string {
  const normalized = value.trim();
  if (normalized !== "localhost" && isIP(normalized) === 0)
    throw new Error(
      "WORKER_HEALTH_HOST must be localhost or an explicit IP address.",
    );
  return normalized;
}
