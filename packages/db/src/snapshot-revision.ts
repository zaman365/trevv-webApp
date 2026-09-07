import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { TrevvDatabase } from "./repositories.js";

/** An invalidation token, never an authorization decision or cross-request cache. */
export async function readOrganizationSnapshotRevision(
  database: TrevvDatabase,
  organizationId: string,
  now = new Date(),
): Promise<string> {
  const [row] = await database.execute<{
    revision: string;
    boundary: string | null;
  }>(sql`
    select coalesce((select revision::text from organization_snapshot_revisions
      where organization_id = ${organizationId}), '0') as revision,
      (select snoozed_until::text from attention_signals
        where organization_id = ${organizationId}
          and snoozed_until is not null and snoozed_until <= ${now.toISOString()}
        order by snoozed_until desc limit 1) as boundary
  `);
  // The snooze boundary changes without a write when attention becomes visible.
  // Hashing keeps internal counters and event times out of the public contract.
  return createHash("sha256")
    .update(
      `${organizationId}\0${row?.revision ?? "0"}\0${row?.boundary ?? ""}`,
    )
    .digest("hex");
}
