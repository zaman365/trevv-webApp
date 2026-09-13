import { describe, expect, it } from "vitest";
import { recoverShareJobs } from "./planning-sharing-recovery";

describe("planning sharing recovery", () => {
  const job = {
    key: "6d594a8c-8ea5-4684-a5e2-0e1f1f4624ce",
    title: "Launch plan",
    input: {
      workspaceId: "38dc3517-99b3-4c33-bc02-2e9b8072ad01",
      title: "Launch plan",
      kind: "workspace",
      visibility: "private",
      participantIds: ["06385077-8992-4ba3-93cc-cb965d5abc66"],
      context: {
        entityType: "board",
        entityId: "f27c825d-d513-4dde-aa8f-3ec27c293121",
      },
      openingMessage: "Please share your feedback.",
    },
  };

  it("retains the exact submission identity for an explicit retry", () => {
    const [recovered] = recoverShareJobs([job]);
    expect(recovered?.key).toBe(job.key);
    expect(recovered?.input.context).toEqual(job.input.context);
    expect(recovered?.input.openingMessage).toBe(job.input.openingMessage);
  });

  it("rejects corrupt and unrelated journal entries", () => {
    expect(recoverShareJobs(null)).toEqual([]);
    expect(
      recoverShareJobs([
        { ...job, key: "invalid" },
        { ...job, input: { ...job.input, visibility: "organization" } },
        { ...job, input: { ...job.input, context: undefined } },
        { ...job, input: { ...job.input, openingMessage: undefined } },
      ]),
    ).toEqual([]);
  });
});
