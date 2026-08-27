import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL("../migrations/0003_wandering_prowler.sql", import.meta.url),
);

describe("TREVV messaging migration", () => {
  const migration = readFileSync(migrationPath, "utf8");

  it("keeps messaging additive and separate from the actionable Inbox", () => {
    expect(migration).toContain('CREATE TABLE "conversations"');
    expect(migration).toContain('CREATE TABLE "conversation_messages"');
    expect(migration).toContain('CREATE TABLE "conversation_participants"');
    expect(migration).not.toContain('ALTER TABLE "inbox_items"');
  });

  it("indexes timelines, threads, unread checkpoints, and response owners", () => {
    expect(migration).toContain('"conversation_messages_timeline_idx"');
    expect(migration).toContain('"conversation_messages_thread_idx"');
    expect(migration).toContain('"conversation_messages_response_idx"');
    expect(migration).toContain('"conversation_participants_user_idx"');
    expect(migration).toContain('"last_read_at" timestamp with time zone');
  });
});
