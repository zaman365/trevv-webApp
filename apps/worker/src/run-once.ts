import { createDatabase, createWorkerRepositories } from "@founderhq/db";
import {
  createWorkerHandlerRegistry,
  defaultWorkerHandlers,
} from "./handlers.js";
import { runWorkerOnce } from "./index.js";
import { readWorkerRuntimeConfiguration } from "./runtime-config.js";

const configuration = readWorkerRuntimeConfiguration(
  {
    ...process.env,
    WORKER_ID: process.env.WORKER_ID?.trim() || `worker-once-${process.pid}`,
  },
  defaultWorkerHandlers.map(({ name }) => name),
);
const handlerRegistry = createWorkerHandlerRegistry(
  defaultWorkerHandlers,
  configuration.disabledHandlerNames,
);

const now = new Date();
const connection = createDatabase(configuration.databaseUrl);

try {
  const result = await runWorkerOnce(
    { now, requestId: crypto.randomUUID() },
    {
      repositories: createWorkerRepositories(connection.db),
      handlerRegistry,
      workerId: configuration.workerId,
      enabled: configuration.enabled,
      batchSize: configuration.batchSize,
      concurrency: configuration.concurrency,
      leaseMs: configuration.leaseMs,
      maxAttempts: configuration.maxAttempts,
      organizationSweepLimit: 100,
    },
  );
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await connection.close();
}
