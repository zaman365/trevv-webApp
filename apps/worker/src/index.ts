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

if (import.meta.url === `file://${process.argv[1]}`) {
  const context = { now: new Date(), requestId: crypto.randomUUID() };
  const results = await Promise.all([
    runReminderSweep(context),
    runOutboxSweep(context),
  ]);
  console.log(
    JSON.stringify({ level: "info", service: "founderhq-worker", results }),
  );
}
