import { describe, it, expect } from "vitest";
import { applyTaskReview, reviewForTaskChange } from "./task-review.js";
const actor = { id: "owner", name: "Owner" };
const reviewers = [
  { id: "alice", name: "Alice" },
  { id: "bob", name: "Bob" },
];
const context = {
  actor,
  reviewers,
  now: "2026-09-14T12:00:00.000Z",
  newId: "round-one",
};
const task = { type: "task", status: "working", version: 1 };
function request() {
  return {
    ...task,
    ...applyTaskReview(
      task,
      {
        action: "request",
        reviewerIds: ["alice", "bob"],
        note: "Check results https://drive.google.com/example",
      },
      context,
    ),
  };
}
describe("task review lifecycle", () => {
  it("requires every assigned reviewer before completion and prevents unassigned or duplicate responses", () => {
    const pending = request();
    expect(() =>
      reviewForTaskChange(pending, { status: "done" }, context.now),
    ).toThrow("All reviewers");
    const response = {
      action: "respond" as const,
      roundId: pending.review.id,
      decision: "approved" as const,
      note: "Verified results",
    };
    expect(() => applyTaskReview(pending, response, context)).toThrow(
      "Only an assigned",
    );
    const first = {
      ...pending,
      ...applyTaskReview(pending, response, {
        ...context,
        actor: reviewers[0]!,
      }),
    };
    expect(first.review.state).toBe("pending");
    expect(() =>
      applyTaskReview(first, response, { ...context, actor: reviewers[0]! }),
    ).toThrow("already been recorded");
    const approved = {
      ...first,
      ...applyTaskReview(first, response, { ...context, actor: reviewers[1]! }),
    };
    expect(approved.review.state).toBe("approved");
    expect(() =>
      reviewForTaskChange(
        approved,
        { status: "done", description: "Changed outcome" },
        context.now,
      ),
    ).toThrow("Changed work needs");
    expect(
      reviewForTaskChange(approved, { status: "done" }, context.now)?.state,
    ).toBe("approved");
    expect(
      reviewForTaskChange(
        approved,
        { description: "Changed deliverable" },
        context.now,
      )?.state,
    ).toBe("invalidated");
    expect(
      reviewForTaskChange(
        { ...approved, status: "done" },
        { status: "working" },
        context.now,
      )?.state,
    ).toBe("invalidated");
  });
  it("tracks feedback, resets all reviewers for a new round, and rejects old-round responses", () => {
    const pending = request();
    const feedback = {
      ...pending,
      ...applyTaskReview(
        pending,
        {
          action: "respond",
          roundId: pending.review.id,
          decision: "changes_requested",
          note: "Fix the totals",
        },
        { ...context, actor: reviewers[0]! },
      ),
    };
    expect(feedback.status).toBe("working");
    expect(feedback.review.reviewers[0]?.note).toBe("Fix the totals");
    const second = {
      ...feedback,
      ...applyTaskReview(
        feedback,
        {
          action: "request",
          reviewerIds: ["alice", "bob"],
          note: "Totals fixed",
        },
        { ...context, newId: "round-two" },
      ),
    };
    expect(second.review.round).toBe(2);
    expect(
      second.review.reviewers.every(
        (reviewer) => reviewer.decision === "pending",
      ),
    ).toBe(true);
    expect(() =>
      applyTaskReview(
        second,
        {
          action: "respond",
          roundId: pending.review.id,
          decision: "approved",
          note: "Fine",
        },
        { ...context, actor: reviewers[1]! },
      ),
    ).toThrow("replaced");
    expect(
      pending.review.reviewers.every(
        (reviewer) => reviewer.decision === "pending",
      ),
    ).toBe(true);
  });
  it("requires valid reviewers, notes and an open task; cancellation stays explicit", () => {
    const pending = request();
    expect(() =>
      applyTaskReview(
        pending,
        { action: "request", reviewerIds: ["alice"], note: "Again" },
        context,
      ),
    ).toThrow("current review");
    expect(() =>
      applyTaskReview(
        task,
        { action: "request", reviewerIds: ["unknown"], note: "Check" },
        context,
      ),
    ).toThrow("access");
    expect(() =>
      applyTaskReview(
        { ...task, status: "done" },
        { action: "request", reviewerIds: ["alice"], note: "Check" },
        context,
      ),
    ).toThrow("Reopen");
    expect(() =>
      applyTaskReview(
        pending,
        { action: "cancel", roundId: pending.review.id, note: " " },
        context,
      ),
    ).toThrow("note");
    const cancelled = {
      ...pending,
      ...applyTaskReview(
        pending,
        {
          action: "cancel",
          roundId: pending.review.id,
          note: "Review no longer needed",
        },
        context,
      ),
    };
    expect(cancelled.review.closingNote).toBe("Review no longer needed");
    expect(
      reviewForTaskChange(cancelled, { status: "done" }, context.now)?.state,
    ).toBe("cancelled");
  });
});
