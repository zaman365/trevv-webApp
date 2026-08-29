import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("./collaboration-repositories.ts", import.meta.url)),
  "utf8",
);

describe("collaboration repository safety boundary", () => {
  it("initializes the repository module graph without a circular-import fault", async () => {
    const databaseModule = await import("./index.js");
    expect(databaseModule.createPostgresRepositories).toBeTypeOf("function");
  });

  it("derives direct-conversation keys from SQL-backfillable sorted IDs", async () => {
    const { directConversationKey } =
      await import("./collaboration-repositories.js");
    const expected = createHash("sha256")
      .update("user-a\u001fuser-b", "utf8")
      .digest("hex");
    expect(directConversationKey(["user-b", "user-a"])).toBe(expected);
  });

  it("scopes collaboration queries and journal records to the organization", () => {
    expect(source).toContain(
      "eq(conversations.organizationId, scope.organizationId)",
    );
    expect(source).toContain(
      "eq(conversationMessages.organizationId, scope.organizationId)",
    );
    expect(source).toContain(
      "eq(teamMembers.organizationId, scope.organizationId)",
    );
    expect(source).toContain(".insert(auditLogs)");
    expect(source).toContain(".insert(outboxEvents)");
    expect(source).toContain(".insert(collaborationEvents)");
  });

  it("persists durable replay identity and rejects changed requests", () => {
    expect(source).toContain("idempotencyRecords");
    expect(source).toContain('"idempotency_key_reused"');
    expect(source).toContain("clientMessageId");
    expect(source).toContain("messageInputFingerprint");
  });

  it("never journals the private message body", () => {
    const journalCalls = [
      ...source.matchAll(/await journal\([\s\S]*?\n  \}\);/gu),
    ].map(([value]) => value);
    expect(journalCalls.some((value) => value.includes("body,"))).toBe(false);
    expect(source).toContain("bodyLength: body.length");
  });
});
