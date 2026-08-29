import { describe, expect, it } from "vitest";
import { readWorkerRuntimeConfiguration } from "./runtime-config";

const validEnvironment = {
  DATABASE_URL: "postgresql://trevv:test@127.0.0.1:5432/trevv",
  DEMO_MODE: "false",
  NODE_ENV: "test",
  WORKER_ID: "worker-alpha-1",
};

describe("worker runtime configuration", () => {
  it("uses bounded defaults and accepts explicit kill switches", () => {
    expect(
      readWorkerRuntimeConfiguration(
        {
          ...validEnvironment,
          WORKER_ENABLED: "false",
          WORKER_DISABLED_HANDLERS: "collaboration, attention,collaboration",
        },
        ["attention", "collaboration"],
      ),
    ).toMatchObject({
      enabled: false,
      disabledHandlerNames: ["attention", "collaboration"],
      batchSize: 5,
      concurrency: 5,
      healthHost: "127.0.0.1",
      healthPort: 9090,
      readinessMaxUnsupportedAgeMs: 300_000,
    });
  });

  it("rejects unknown handlers and unsafe bounded values", () => {
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        WORKER_DISABLED_HANDLERS: "provider",
      }),
    ).toThrow(/Unknown disabled/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        WORKER_CONCURRENCY: "11",
      }),
    ).toThrow(/1 to 10/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        WORKER_READINESS_MAX_UNSUPPORTED_AGE_MS: "999",
      }),
    ).toThrow(/1000 to 86400000/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        WORKER_ENABLED: "sometimes",
      }),
    ).toThrow(/true or false/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        WORKER_HEALTH_HOST: "999.999.999.999",
      }),
    ).toThrow(/explicit IP address/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        NODE_ENV: "staging",
      }),
    ).toThrow(/development, test, or production/);
  });

  it("fails closed on demo mode and plaintext production PostgreSQL", () => {
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow(/sslmode=verify-full/);
    for (const sslmode of ["require", "verify-ca"]) {
      expect(() =>
        readWorkerRuntimeConfiguration({
          ...validEnvironment,
          NODE_ENV: "production",
          DATABASE_URL: `postgresql://trevv:test@db.trevv.test:5432/trevv?sslmode=${sslmode}`,
        }),
      ).toThrow(/sslmode=verify-full/);
    }
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        NODE_ENV: "production",
        DEMO_MODE: "false",
        DATABASE_URL:
          "postgresql://trevv:test@db.trevv.test:5432/trevv?sslmode=verify-full",
      }),
    ).not.toThrow();
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        DEMO_MODE: "true",
      }),
    ).toThrow(/DEMO_MODE=false/);
    expect(() =>
      readWorkerRuntimeConfiguration({
        ...validEnvironment,
        DEMO_MODE: undefined,
      }),
    ).toThrow(/DEMO_MODE=false/);
  });
});
