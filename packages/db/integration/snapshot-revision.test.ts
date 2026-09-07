import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  createDatabase,
  readOrganizationSnapshotRevision,
} from "../src/index.js";
import {
  createTemporaryDatabase,
  migrateCurrent,
  type TemporaryDatabase,
} from "./database-test-helper.js";

let temporary: TemporaryDatabase;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-05T12:00:00Z");
const token = (org = "revision-one", at = now) =>
  readOrganizationSnapshotRevision(database.db, org, at);

beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await migrateCurrent(temporary.url);
  database = createDatabase(temporary.url);
  await database.db.execute(sql`insert into organizations(id,name,slug) values
    ('revision-one','One','revision-one'), ('revision-two','Two','revision-two')`);
  await database.db.execute(
    sql`insert into app_users(id,name,email) values ('revision-user','Owner','revision@example.test')`,
  );
  await database.db
    .execute(sql`insert into memberships(organization_id,user_id,role) values
    ('revision-one','revision-user','owner'), ('revision-two','revision-user','owner')`);
  await database.db.execute(
    sql`insert into portfolios(id,organization_id,name,slug) values ('revision-portfolio','revision-one','One','one')`,
  );
}, 120_000);

afterAll(async () => {
  await database?.close();
  await temporary?.drop();
}, 120_000);

describe("transactional snapshot revisions", () => {
  it("tracks updates and deletes without invalidating unrelated organizations", async () => {
    const before = await token();
    const other = await token("revision-two");
    await database.db.execute(
      sql`insert into portfolios(id,organization_id,name,slug) values ('revision-extra','revision-one','Extra','extra')`,
    );
    const inserted = await token();
    expect(inserted).not.toBe(before);
    await database.db.execute(
      sql`update portfolios set name='Edited' where id='revision-extra'`,
    );
    const updated = await token();
    expect(updated).not.toBe(inserted);
    await database.db.execute(
      sql`delete from portfolios where id='revision-extra'`,
    );
    expect(await token()).not.toBe(updated);
    expect(await token("revision-two")).toBe(other);
  });

  it("coalesces a bulk statement and rolls invalidation back with its data", async () => {
    const [before] = await database.db.execute<{ revision: string }>(
      sql`select revision::text from organization_snapshot_revisions where organization_id='revision-one'`,
    );
    await database.db
      .execute(sql`insert into portfolios(id,organization_id,name,slug)
      select 'revision-bulk-'||n, 'revision-one', 'Bulk', 'bulk-'||n from generate_series(1,10000) n`);
    const [after] = await database.db.execute<{ revision: string }>(
      sql`select revision::text from organization_snapshot_revisions where organization_id='revision-one'`,
    );
    expect(BigInt(after!.revision) - BigInt(before!.revision)).toBe(1n);
    const stable = await token();
    await expect(
      database.db.transaction(async (transaction) => {
        await transaction.execute(
          sql`update portfolios set name='Rolled back' where id='revision-portfolio'`,
        );
        throw new Error("rollback fixture");
      }),
    ).rejects.toThrow("rollback fixture");
    expect(await token()).toBe(stable);
    await database.db.execute(
      sql`delete from portfolios where id like 'revision-bulk-%'`,
    );
  });

  it("keeps unchanged content stable when the worker updates computation freshness", async () => {
    const before = await token();
    await database.db.execute(
      sql`update organizations set attention_computed_at=${now.toISOString()} where id='revision-one'`,
    );
    expect(await token()).toBe(before);
    await database.db.execute(
      sql`update organizations set name='Renamed organization' where id='revision-one'`,
    );
    expect(await token()).not.toBe(before);
  });

  it("invalidates affected member organizations when shared profile data changes", async () => {
    const before = await Promise.all([token(), token("revision-two")]);
    await database.db.execute(
      sql`update app_users set name='New display name' where id='revision-user'`,
    );
    expect(await token()).not.toBe(before[0]);
    expect(await token("revision-two")).not.toBe(before[1]);
  });

  it("changes when a snoozed signal becomes visible without another database write", async () => {
    await database.db.execute(sql`insert into attention_signals
      (id,organization_id,portfolio_id,entity_type,entity_id,signal_type,severity,impact,urgency,reason,reason_code,source_fingerprint,source_occurred_at,computed_at,snoozed_until)
      values ('revision-signal','revision-one','revision-portfolio','portfolio','revision-portfolio','test','low',1,1,'Test','revision-snooze','test',${now.toISOString()},${now.toISOString()},${new Date(now.getTime() + 1000).toISOString()})`);
    const before = await token();
    expect(await token("revision-one", new Date(now.getTime() + 999))).toBe(
      before,
    );
    const expired = await token("revision-one", new Date(now.getTime() + 1000));
    expect(expired).not.toBe(before);
    expect(await token("revision-one", new Date(now.getTime() + 2000))).toBe(
      expired,
    );
  });

  it("installs transactional invalidation for every complete-snapshot source", async () => {
    const rows = await database.db.execute<{
      name: string;
      triggers: number;
    }>(sql`
      select c.relname as name, count(*)::int as triggers from pg_trigger t
      join pg_class c on c.oid=t.tgrelid where t.tgname like 'trevv_snapshot_%'
      group by c.relname order by c.relname
    `);
    expect(rows.map((row) => row.name)).toEqual([
      "app_users",
      "attention_signals",
      "item_assignees",
      "memberships",
      "organizations",
      "portfolio_members",
      "portfolios",
      "waiting_states",
      "work_items",
      "workspace_members",
      "workspace_metrics",
      "workspace_updates",
      "workspaces",
    ]);
    expect(rows.every((row) => row.triggers === 4)).toBe(true);
  });
});
