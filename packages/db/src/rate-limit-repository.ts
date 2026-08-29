import { createHmac } from "node:crypto";
import { lte, sql } from "drizzle-orm";
import type { TrevvDatabase } from "./repositories.js";
import { apiRateLimitWindows } from "./schema.js";

export interface RateLimitConsumeInput {
  bucket: string;
  clientKey: string;
  windowMs: number;
  now: Date;
}

export interface RateLimitWindowProjection {
  count: number;
  resetAt: Date;
}

export interface RateLimitRepository {
  consume(input: RateLimitConsumeInput): Promise<RateLimitWindowProjection>;
  pruneExpired(now: Date): Promise<number>;
}

export function createRateLimitRepository(
  database: TrevvDatabase,
  hashSecret: string,
): RateLimitRepository {
  validateHashSecret(hashSecret);
  return {
    async consume(input) {
      validateInput(input);
      const windowStartedAt = new Date(
        Math.floor(input.now.getTime() / input.windowMs) * input.windowMs,
      );
      const resetAt = new Date(windowStartedAt.getTime() + input.windowMs);
      const expiresAt = new Date(
        windowStartedAt.getTime() + Math.max(input.windowMs * 2, 3_600_000),
      );
      const clientKeyHash = hashClientKey(input.clientKey, hashSecret);
      const [row] = await database
        .insert(apiRateLimitWindows)
        .values({
          bucket: input.bucket,
          clientKeyHash,
          windowStartedAt,
          windowMs: input.windowMs,
          requestCount: 1,
          expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .onConflictDoUpdate({
          target: [
            apiRateLimitWindows.bucket,
            apiRateLimitWindows.clientKeyHash,
            apiRateLimitWindows.windowStartedAt,
          ],
          set: {
            requestCount: sql`${apiRateLimitWindows.requestCount} + 1`,
            updatedAt: input.now,
          },
        })
        .returning({ requestCount: apiRateLimitWindows.requestCount });
      if (!row) throw new Error("Rate-limit persistence returned no row.");
      return { count: row.requestCount, resetAt };
    },
    async pruneExpired(now) {
      if (!Number.isFinite(now.getTime()))
        throw new Error("Rate-limit cleanup time must be valid.");
      const removed = await database
        .delete(apiRateLimitWindows)
        .where(lte(apiRateLimitWindows.expiresAt, now))
        .returning({ bucket: apiRateLimitWindows.bucket });
      return removed.length;
    },
  };
}

export function hashClientKey(value: string, hashSecret: string): string {
  if (!value || value.length > 512)
    throw new Error("The rate-limit client key must contain 1-512 characters.");
  validateHashSecret(hashSecret);
  return createHmac("sha256", hashSecret).update(value, "utf8").digest("hex");
}

function validateInput(input: RateLimitConsumeInput): void {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(input.bucket))
    throw new Error("The rate-limit bucket is invalid.");
  if (
    !Number.isSafeInteger(input.windowMs) ||
    input.windowMs < 1_000 ||
    input.windowMs > 86_400_000
  )
    throw new Error("The rate-limit window must be 1 second to 24 hours.");
  if (!Number.isFinite(input.now.getTime()))
    throw new Error("The rate-limit observation time must be valid.");
  if (!input.clientKey || input.clientKey.length > 512)
    throw new Error("The rate-limit client key must contain 1-512 characters.");
}

function validateHashSecret(value: string): void {
  if (
    value.length < 32 ||
    /replace-with|change-me|example|password/iu.test(value)
  )
    throw new Error(
      "The rate-limit hash secret must contain at least 32 non-placeholder characters.",
    );
}
