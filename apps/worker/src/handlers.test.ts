import { describe, expect, it } from "vitest";
import type { WorkerTransactionRepositories } from "@founderhq/db";
import {
  auditWorkerHandler,
  collaborationWorkerHandler,
  createWorkerHandlerRegistry,
  defaultWorkerHandlers,
} from "./handlers";

describe("worker handler registry", () => {
  it("provides typed ownership and removes disabled handlers from leasing", () => {
    const registry = createWorkerHandlerRegistry(defaultWorkerHandlers, [
      "collaboration",
    ]);

    expect(registry.handlerEventTypes).toContain("message.sent");
    expect(registry.handlerEventTypes).toContain("organization.updated");
    expect(registry.activeEventTypes).not.toContain("message.sent");
    expect(registry.resolve("message.sent")).toBeUndefined();
    expect(registry.resolve("item.updated")?.name).toBe("attention");
    expect(registry.resolve("board.updated")?.name).toBe("audit");
    expect(registry.isActive("attention")).toBe(true);
  });

  it("acknowledges only explicitly reviewed audit-only events", async () => {
    const registry = createWorkerHandlerRegistry();
    for (const eventType of [
      "application_user.updated",
      "board.created",
      "comment.updated",
      "inbox_item.captured",
      "invitation.delivery_failed",
      "review_ritual.updated",
      "workspace_snapshot.created",
    ])
      expect(registry.resolve(eventType)?.name).toBe("audit");
    expect(registry.resolve("provider.delivery_requested")).toBeUndefined();

    const result = { recomputed: false };
    const repositories = {
      processInternalEvent: async () => result,
    } as unknown as WorkerTransactionRepositories;
    await expect(
      auditWorkerHandler.process(
        repositories,
        new Date("2026-08-29T10:00:00.000Z"),
      ),
    ).resolves.toEqual(result);
  });

  it("owns every collaboration event, including durable retention", async () => {
    const registry = createWorkerHandlerRegistry();
    for (const eventType of [
      "team.created",
      "team.updated",
      "team.membership_changed",
      "conversation.created",
      "conversation.participants_changed",
      "conversation.read",
      "message.sent",
      "message.response_changed",
      "message.reaction_changed",
      "message.retention_due",
    ])
      expect(registry.resolve(eventType)?.name).toBe("collaboration");

    const result = { recomputed: false, effects: 1 };
    const repositories = {
      processInternalEvent: async () => result,
    } as unknown as WorkerTransactionRepositories;
    await expect(
      collaborationWorkerHandler.process(
        repositories,
        new Date("2026-08-29T10:00:00.000Z"),
      ),
    ).resolves.toEqual(result);
  });

  it("rejects ambiguous event ownership and unknown kill switches", () => {
    expect(() =>
      createWorkerHandlerRegistry([
        collaborationWorkerHandler,
        {
          ...collaborationWorkerHandler,
          name: "duplicate",
          eventTypes: ["message.sent"],
        },
      ]),
    ).toThrow(/owned by both/);
    expect(() =>
      createWorkerHandlerRegistry(defaultWorkerHandlers, ["provider"]),
    ).toThrow(/Unknown disabled/);
  });
});
