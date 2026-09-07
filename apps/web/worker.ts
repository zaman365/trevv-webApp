import app from "vinext/server/app-router-entry";
import { workerRenderFailure } from "./lib/worker-render-failure";

const worker = {
  async fetch(...args: Parameters<typeof app.fetch>) {
    try {
      return await app.fetch(...args);
    } catch {
      // Never expose adapter stacks or lose document recovery when SSR fails
      // before React can render the application's global error boundary.
      console.error(
        JSON.stringify({
          level: "error",
          service: "trevv-web",
          event: "worker_render_failed",
        }),
      );
      return workerRenderFailure(args[0]);
    }
  },
};

export default worker;
