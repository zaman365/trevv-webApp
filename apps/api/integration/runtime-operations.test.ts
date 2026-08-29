import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { apiRateLimitWindows, createDatabase } from "@founderhq/db";
import { createRuntimeApi } from "../src/app.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "../../../packages/db/integration/database-test-helper.js";

let temporary: TemporaryDatabase;

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
}, 120_000);

afterAll(async () => {
  await temporary?.drop();
}, 120_000);

afterEach(() => vi.unstubAllEnvs());

describe("live runtime operational dependencies", () => {
  it("constructs a shared limiter from the runtime database by default", async () => {
    const environment = {
      DEMO_MODE: "false",
      NODE_ENV: "test",
      DATABASE_URL: temporary.url,
      BETTER_AUTH_URL: "http://127.0.0.1:8787",
      BETTER_AUTH_SECRET:
        "runtime-test-secret-with-more-than-thirty-two-characters",
      WEB_ORIGIN: "http://127.0.0.1:3100",
      MAIL_FROM: "no-reply@trevv.test",
      MAIL_SINK_FILE: join(
        tmpdir(),
        `trevv-runtime-operations-${process.pid}.jsonl`,
      ),
      RATE_LIMIT_BACKEND: "postgres",
      RATE_LIMIT_HASH_SECRET: "runtime-rate-limit-hmac-material-only",
      TRUSTED_CLIENT_IP_HEADER: "x-trevv-client-ip",
      ERROR_REPORTING_MODE: "disabled",
    };
    for (const [name, value] of Object.entries(environment))
      vi.stubEnv(name, value);

    const first = createRuntimeApi();
    const second = createRuntimeApi();
    try {
      for (const runtime of [first, second]) {
        const response = await runtime.app.request("/api/v1/portfolios", {
          headers: { "x-trevv-client-ip": "192.0.2.80" },
        });
        expect(response.status).toBe(401);
      }
    } finally {
      await Promise.all([first.close(), second.close()]);
    }

    const inspection = createDatabase(temporary.url);
    try {
      const windows = await inspection.db.select().from(apiRateLimitWindows);
      expect(windows).toHaveLength(1);
      expect(windows[0]).toMatchObject({
        bucket: "api-read",
        requestCount: 2,
      });
      expect(JSON.stringify(windows)).not.toContain("192.0.2.80");
    } finally {
      await inspection.close();
    }
  });
});
