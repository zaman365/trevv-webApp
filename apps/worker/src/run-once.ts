import { createDatabase, createWorkerRepositories } from "@founderhq/db";
import { runWorkerOnce } from "./index";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required.");

const now = new Date();
const connection = createDatabase(databaseUrl);

try {
  const result = await runWorkerOnce(
    { now, requestId: crypto.randomUUID() },
    {
      repositories: createWorkerRepositories(connection.db),
      workerId: process.env.WORKER_ID?.trim() || `worker-once-${process.pid}`,
      batchSize: 100,
      leaseMs: 30_000,
      maxAttempts: 8,
      organizationSweepLimit: 100,
    },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await connection.close();
}
