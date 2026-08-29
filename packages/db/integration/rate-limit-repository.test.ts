import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  apiRateLimitWindows,
  createDatabase,
  createRateLimitRepository,
} from "../src/index.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let first: ReturnType<typeof createDatabase>;
let second: ReturnType<typeof createDatabase>;

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  first = createDatabase(temporary.url);
  second = createDatabase(temporary.url);
}, 120_000);

afterAll(async () => {
  await Promise.all([first?.close(), second?.close()]);
  await temporary?.drop();
}, 120_000);

describe("shared PostgreSQL rate-limit windows", () => {
  it("atomically counts across instances without retaining raw client keys", async () => {
    const now = new Date("2026-08-29T12:00:00.000Z");
    const input = {
      bucket: "api-read",
      clientKey: "ip:192.0.2.42",
      windowMs: 60_000,
      now,
    };
    const hashSecret = "integration-rate-limit-key-material-01";
    const firstRepository = createRateLimitRepository(first.db, hashSecret);
    const secondRepository = createRateLimitRepository(second.db, hashSecret);
    await expect(firstRepository.consume(input)).resolves.toMatchObject({
      count: 1,
      resetAt: new Date("2026-08-29T12:01:00.000Z"),
    });
    await expect(secondRepository.consume(input)).resolves.toMatchObject({
      count: 2,
    });
    const concurrent = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        (index % 2 === 0 ? firstRepository : secondRepository).consume(input),
      ),
    );
    expect(concurrent.map(({ count }) => count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 3),
    );

    const rows = await first.db.select().from(apiRateLimitWindows);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain("192.0.2.42");

    await expect(
      secondRepository.consume({
        ...input,
        now: new Date("2026-08-29T12:01:00.000Z"),
      }),
    ).resolves.toMatchObject({ count: 1 });
    await expect(
      firstRepository.pruneExpired(new Date("2026-08-29T14:00:00.000Z")),
    ).resolves.toBe(2);
  });
});
