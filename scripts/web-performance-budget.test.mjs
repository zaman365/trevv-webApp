import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CANONICAL_CRITICAL_ROUTES,
  evaluateWebPerformanceBudgets,
  measureWebBuild,
  validateWebPerformanceBudgetConfiguration,
} from "./web-performance-budget.mjs";

const directory = mkdtempSync(join(tmpdir(), "trevv-web-budget-"));
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
after(() => rmSync(directory, { recursive: true, force: true }));

function canonicalBudget(routeOverrides = {}) {
  return {
    version: 1,
    criticalRoutes: [...CANONICAL_CRITICAL_ROUTES],
    routes: Object.fromEntries(
      CANONICAL_CRITICAL_ROUTES.map((route) => [
        route,
        {
          manifest: "server/app/example/page_client-reference-manifest.js",
          ...(route.startsWith("/app/")
            ? { selectedDynamicImports: ["loader.tsx -> ./selected"] }
            : {}),
          maximumInitialJavaScriptGzipBytes: 10_000,
          maximumInitialCssGzipBytes: 10_000,
          ...routeOverrides[route],
        },
      ]),
    ),
    maximumSingleInitialAssetGzipBytes: 10_000,
    publicImages: { maximumSingleBytes: 100, maximumTotalBytes: 100 },
  };
}

test("measures unique initial assets and enforces route and image budgets", () => {
  const buildDirectory = join(directory, ".next");
  const publicDirectory = join(directory, "public");
  mkdirSync(join(buildDirectory, "server/app/example"), { recursive: true });
  mkdirSync(join(buildDirectory, "static/chunks"), { recursive: true });
  mkdirSync(join(buildDirectory, "static/css"), { recursive: true });
  mkdirSync(publicDirectory, { recursive: true });
  writeFileSync(
    join(buildDirectory, "build-manifest.json"),
    JSON.stringify({ rootMainFiles: ["static/chunks/shared.js"] }),
  );
  writeFileSync(
    join(buildDirectory, "react-loadable-manifest.json"),
    JSON.stringify({
      "loader.tsx -> ./selected": {
        files: [
          "static/chunks/shared.js",
          "static/chunks/selected.js",
          "static/css/selected.css",
        ],
      },
    }),
  );
  writeFileSync(
    join(buildDirectory, "static/chunks/shared.js"),
    "shared".repeat(50),
  );
  writeFileSync(
    join(buildDirectory, "static/chunks/route.js"),
    "route".repeat(50),
  );
  writeFileSync(
    join(buildDirectory, "static/chunks/selected.js"),
    "selected".repeat(50),
  );
  writeFileSync(
    join(buildDirectory, "static/css/route.css"),
    "style".repeat(50),
  );
  writeFileSync(
    join(buildDirectory, "static/css/selected.css"),
    "selected-style".repeat(50),
  );
  writeFileSync(join(publicDirectory, "preview.png"), Buffer.alloc(40));
  writeFileSync(
    join(
      buildDirectory,
      "server/app/example/page_client-reference-manifest.js",
    ),
    'globalThis.__RSC_MANIFEST={};globalThis.__RSC_MANIFEST["/example/page"]={"clientModules":{"one":{"chunks":["1","static/chunks/route.js"]},"duplicate":{"chunks":["1","static/chunks/route.js"]}},"entryCSSFiles":{"route":[{"path":"static/css/route.css"}]}};',
  );
  const budget = canonicalBudget();
  const measurement = measureWebBuild({
    buildDirectory,
    publicDirectory,
    budget,
  });
  assert.equal(measurement.routes["/app/portfolio"].javaScriptFiles, 3);
  assert.equal(measurement.routes["/app/portfolio"].cssFiles, 2);
  assert.equal(measurement.routes["/app/portfolio"].selectedDynamicImports, 1);
  assert.deepEqual(evaluateWebPerformanceBudgets(measurement, budget), []);

  budget.publicImages.maximumSingleBytes = 10;
  assert.match(
    evaluateWebPerformanceBudgets(measurement, budget).join("\n"),
    /largest public image/u,
  );
});

test("fails when a declared selected dynamic import is absent", () => {
  assert.throws(
    () =>
      measureWebBuild({
        buildDirectory: join(directory, ".next"),
        publicDirectory: join(directory, "public"),
        budget: canonicalBudget({
          "/app/portfolio": {
            selectedDynamicImports: ["loader.tsx -> ./missing"],
          },
        }),
      }),
    /Missing selected dynamic import/u,
  );
});

test("the checked-in budget covers the fixed canonical route set", () => {
  const budget = JSON.parse(
    readFileSync(
      join(repositoryRoot, "config/web-performance-budgets.json"),
      "utf8",
    ),
  );
  assert.equal(validateWebPerformanceBudgetConfiguration(budget), budget);
});

test("deleting a canonical route cannot weaken the gate", () => {
  const budget = canonicalBudget();
  delete budget.routes["/app/workspaces/:workspace/messages"];
  assert.throws(
    () => validateWebPerformanceBudgetConfiguration(budget),
    /Missing canonical critical route budgets: \/app\/workspaces\/:workspace\/messages/u,
  );

  const declaration = canonicalBudget();
  declaration.criticalRoutes = declaration.criticalRoutes.filter(
    (route) => route !== "/app/workspaces/:workspace/messages",
  );
  assert.throws(
    () => validateWebPerformanceBudgetConfiguration(declaration),
    /criticalRoutes must exactly match the canonical critical route set/u,
  );
});

test("every declared critical app route must select a dynamic import", () => {
  const budget = canonicalBudget({
    "/app/workspaces/:workspace/teams": { selectedDynamicImports: [] },
  });
  assert.throws(
    () => validateWebPerformanceBudgetConfiguration(budget),
    /critical app route must declare at least one selected dynamic import/u,
  );

  budget.routes["/app/workspaces/:workspace/teams"].selectedDynamicImports = [
    "loader.tsx -> ./selected",
  ];
  budget.routes["/app/workspaces/:workspace/new-critical-view"] = {
    manifest: "server/app/example/page_client-reference-manifest.js",
    maximumInitialJavaScriptGzipBytes: 10_000,
    maximumInitialCssGzipBytes: 10_000,
  };
  assert.throws(
    () => validateWebPerformanceBudgetConfiguration(budget),
    /critical app route must declare at least one selected dynamic import/u,
  );
});
