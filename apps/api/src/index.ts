import { serve } from "@hono/node-server";
import { createRuntimeApi } from "./app.js";

const port = Number.parseInt(process.env.PORT ?? "8787", 10);
const runtime = createRuntimeApi();
const server = serve({ fetch: runtime.app.fetch, port }, (info) => {
  console.log(
    JSON.stringify({
      level: "info",
      message: "TREVV API ready",
      url: `http://localhost:${info.port}`,
      release: runtime.releaseMetadata,
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    server.close(() => {
      void runtime.close().finally(() => process.exit(0));
    });
  });
