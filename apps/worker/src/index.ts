export interface JobContext {
  now: Date;
  requestId: string;
}
export interface JobResult {
  job: string;
  processed: number;
  durationMs: number;
}

export async function runReminderSweep(
  context: JobContext,
): Promise<JobResult> {
  const started = performance.now();
  // The production adapter leases due reminders and emits notification/email jobs idempotently.
  return {
    job: "reminder-sweep",
    processed: 0,
    durationMs: Math.round(performance.now() - started),
  };
}

export async function runOutboxSweep(context: JobContext): Promise<JobResult> {
  const started = performance.now();
  // The PostgreSQL worker uses SELECT ... FOR UPDATE SKIP LOCKED and records attempts before acknowledging.
  return {
    job: "outbox-sweep",
    processed: 0,
    durationMs: Math.round(performance.now() - started),
  };
}

export async function runAttentionSweep(
  context: JobContext,
): Promise<JobResult> {
  const started = performance.now();
  // The production adapter regenerates deterministic signals from due work,
  // dependencies, waiting states, Hub updates, and cross-Hub ownership.
  return {
    job: "attention-sweep",
    processed: 0,
    durationMs: Math.round(performance.now() - started),
  };
}

export async function runReviewSweep(context: JobContext): Promise<JobResult> {
  const started = performance.now();
  // Review reminders are optional per ritual and never turn informational
  // activity into Inbox work without an actionable owner.
  return {
    job: "review-sweep",
    processed: 0,
    durationMs: Math.round(performance.now() - started),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const context = { now: new Date(), requestId: crypto.randomUUID() };
  const results = await Promise.all([
    runReminderSweep(context),
    runOutboxSweep(context),
    runAttentionSweep(context),
    runReviewSweep(context),
  ]);
  console.log(
    JSON.stringify({ level: "info", service: "trevv-worker", results }),
  );
}
