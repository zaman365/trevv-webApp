import { describe, expect, it } from "vitest";
import {
  runAttentionSweep,
  runOutboxSweep,
  runReminderSweep,
  runReviewSweep,
} from "./index";

describe("worker foundations", () => {
  it("runs reminder and outbox handlers with structured results", async () => {
    const context = { now: new Date(), requestId: "test-request" };
    const [reminders, outbox, attention, reviews] = await Promise.all([
      runReminderSweep(context),
      runOutboxSweep(context),
      runAttentionSweep(context),
      runReviewSweep(context),
    ]);
    expect(reminders.job).toBe("reminder-sweep");
    expect(outbox.job).toBe("outbox-sweep");
    expect(attention.job).toBe("attention-sweep");
    expect(reviews.job).toBe("review-sweep");
  });
});
