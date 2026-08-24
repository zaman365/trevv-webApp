import { describe, expect, it } from "vitest";
import { runOutboxSweep, runReminderSweep } from "./index";

describe("worker foundations", () => {
  it("runs reminder and outbox handlers with structured results", async () => {
    const context = { now: new Date(), requestId: "test-request" };
    const [reminders, outbox] = await Promise.all([
      runReminderSweep(context),
      runOutboxSweep(context),
    ]);
    expect(reminders.job).toBe("reminder-sweep");
    expect(outbox.job).toBe("outbox-sweep");
  });
});
