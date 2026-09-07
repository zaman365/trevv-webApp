import { test } from "node:test";
import assert from "node:assert/strict";
import {
  staticModuleImports,
  validateWorkerBudgets,
  workerRouteEntrypoints,
  enforceWorkerBudgets,
} from "./worker-performance-budget.mjs";

test("the shipped live Settings implementation and every workspace view are explicit", () => {
  assert.ok(
    workerRouteEntrypoints["/app/workspaces/:workspace/settings"].includes(
      "live-work-views",
    ),
  );
  assert.ok(
    !workerRouteEntrypoints["/app/workspaces/:workspace/settings"].includes(
      "settings-experience",
    ),
  );
});

test("static closures parse reexports without counting unrelated lazy features or strings", () => {
  assert.deepEqual(
    staticModuleImports(
      `import {x} from './a.js'; export {y} from './b.js'; import('./lazy.js'); const s="import './fake.js'";`,
    ),
    ["./a.js", "./b.js"],
  );
});

test("omitting a live route or missing the actual measurement fails the gate", () => {
  const routes = Object.fromEntries(
    Object.keys(workerRouteEntrypoints).map((route) => [
      route,
      { javascriptGzipBytes: 300000, cssGzipBytes: 65000 },
    ]),
  );
  validateWorkerBudgets({ version: 1, routes });
  assert.throws(
    () => enforceWorkerBudgets({}, { version: 1, routes }),
    /missing/,
  );
  delete routes["/app/workspaces/:workspace/settings"];
  assert.throws(
    () => validateWorkerBudgets({ version: 1, routes }),
    /every canonical/,
  );
});
