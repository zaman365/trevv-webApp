import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  auditWorkerEventTypes,
  collaborationWorkerEventTypes,
  internalWorkerEventTypes,
  knownWorkerEventTypes,
  workerEventCatalog,
} from "./worker-repositories";

const producerSources = [
  readFileSync(new URL("./repositories.ts", import.meta.url), "utf8"),
  readFileSync(new URL("./identity-repositories.ts", import.meta.url), "utf8"),
  readFileSync(
    new URL("./collaboration-repositories.ts", import.meta.url),
    "utf8",
  ),
];

describe("worker event catalog", () => {
  it("assigns every known event to exactly one reviewed handler", () => {
    const assigned = [
      ...internalWorkerEventTypes,
      ...auditWorkerEventTypes,
      ...collaborationWorkerEventTypes,
    ];
    expect(new Set(assigned).size).toBe(assigned.length);
    expect([...assigned].sort()).toEqual([...knownWorkerEventTypes].sort());

    for (const [eventType, definition] of Object.entries(workerEventCatalog)) {
      expect(definition.reason, eventType).not.toHaveLength(0);
      expect(definition.effect, eventType).toBe(
        definition.handler === "attention"
          ? "recompute_attention"
          : definition.handler === "collaboration"
            ? "apply_collaboration_effect"
            : "acknowledge_audit_only",
      );
    }
  });

  it("catalogs every event literal emitted by the repository writers", () => {
    const emitted = new Set<string>();
    const explicitEvent =
      /\b(?:eventType|type)\s*(?::|=)\s*"([a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+)"/gu;
    for (const source of producerSources)
      for (const match of source.matchAll(explicitEvent))
        emitted.add(match[1]!);

    const repositorySource = producerSources[0]!;
    expect(repositorySource).toContain(
      "eventType: `invitation.delivery_${input.status}`",
    );
    emitted.add("invitation.delivery_sent");
    emitted.add("invitation.delivery_failed");

    // Membership mutation uses a reviewed ternary for both action and event.
    for (const eventType of [
      "membership.updated",
      "membership.revoked",
      "membership.restored",
    ]) {
      expect(repositorySource).toContain(`"${eventType}"`);
      emitted.add(eventType);
    }

    expect(
      [...emitted].filter((eventType) => !(eventType in workerEventCatalog)),
    ).toEqual([]);
    expect([...knownWorkerEventTypes].sort()).toEqual([...emitted].sort());
  });
});
