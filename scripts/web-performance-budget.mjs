import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultBuildDirectory = join(repositoryRoot, "apps/web/.next");
const defaultPublicDirectory = join(repositoryRoot, "apps/web/public");
const defaultBudgetFile = join(
  repositoryRoot,
  "config/web-performance-budgets.json",
);

// This list is deliberately independent of the editable budget JSON. Removing a
// route from that file must fail the gate instead of silently reducing coverage.
export const CANONICAL_CRITICAL_ROUTES = Object.freeze([
  "/sign-in",
  "/app/portfolio",
  "/app/workspaces/:workspace",
  "/app/workspaces/:workspace/work",
  "/app/workspaces/:workspace/messages",
  "/app/workspaces/:workspace/teams",
  "/app/workspaces/:workspace/settings",
  "/app/workspaces/:workspace/boards/:board",
]);

export function validateWebPerformanceBudgetConfiguration(budget) {
  if (!budget || typeof budget !== "object" || Array.isArray(budget))
    throw new Error("Web performance budget must be an object.");
  if (budget.version !== 1)
    throw new Error("Web performance budget version must be 1.");
  if (
    !budget.routes ||
    typeof budget.routes !== "object" ||
    Array.isArray(budget.routes)
  )
    throw new Error("Web performance budget routes must be an object.");

  if (
    !Array.isArray(budget.criticalRoutes) ||
    budget.criticalRoutes.length !== CANONICAL_CRITICAL_ROUTES.length ||
    CANONICAL_CRITICAL_ROUTES.some(
      (route) => !budget.criticalRoutes.includes(route),
    ) ||
    budget.criticalRoutes.some(
      (route) => !CANONICAL_CRITICAL_ROUTES.includes(route),
    )
  )
    throw new Error(
      "Web performance budget criticalRoutes must exactly match the canonical critical route set.",
    );

  const missingRoutes = CANONICAL_CRITICAL_ROUTES.filter(
    (route) => !Object.hasOwn(budget.routes, route),
  );
  if (missingRoutes.length)
    throw new Error(
      `Missing canonical critical route budgets: ${missingRoutes.join(", ")}`,
    );

  for (const [route, routeBudget] of Object.entries(budget.routes)) {
    if (!routeBudget || typeof routeBudget !== "object")
      throw new Error(`${route}: route budget must be an object.`);
    if (typeof routeBudget.manifest !== "string" || !routeBudget.manifest)
      throw new Error(`${route}: route budget must declare a manifest.`);
    if (!route.startsWith("/app/")) continue;
    if (
      !Array.isArray(routeBudget.selectedDynamicImports) ||
      routeBudget.selectedDynamicImports.length === 0 ||
      routeBudget.selectedDynamicImports.some(
        (entry) => typeof entry !== "string" || !entry,
      )
    )
      throw new Error(
        `${route}: critical app route must declare at least one selected dynamic import.`,
      );
  }

  return budget;
}

export function measureWebBuild({ buildDirectory, publicDirectory, budget }) {
  validateWebPerformanceBudgetConfiguration(budget);
  const buildManifest = readJson(join(buildDirectory, "build-manifest.json"));
  const loadableManifest = readJson(
    join(buildDirectory, "react-loadable-manifest.json"),
  );
  const sharedJavaScript = buildManifest.rootMainFiles ?? [];
  const routes = Object.fromEntries(
    Object.entries(budget.routes).map(([route, routeBudget]) => {
      const manifestPath = join(buildDirectory, routeBudget.manifest);
      if (!existsSync(manifestPath))
        throw new Error(
          `Missing client-reference manifest for ${route}: ${routeBudget.manifest}`,
        );
      const manifest = readClientReferenceManifest(manifestPath);
      const selectedDynamicFiles = (
        routeBudget.selectedDynamicImports ?? []
      ).flatMap((key) => {
        const dynamicImport = loadableManifest[key];
        if (!dynamicImport)
          throw new Error(
            `Missing selected dynamic import for ${route}: ${key}`,
          );
        return dynamicImport.files ?? [];
      });
      const javaScript = new Set([
        ...sharedJavaScript,
        ...Object.values(manifest.clientModules ?? {}).flatMap((module) =>
          (module.chunks ?? []).filter((chunk) => chunk.endsWith?.(".js")),
        ),
        ...selectedDynamicFiles.filter((file) => file.endsWith(".js")),
      ]);
      const css = new Set([
        ...selectedDynamicFiles.filter((file) => file.endsWith(".css")),
        ...Object.values(manifest.entryCSSFiles ?? {})
          .flat()
          .map((entry) => entry.path),
      ]);
      const javaScriptMeasurements = measureFiles(buildDirectory, javaScript);
      const cssMeasurements = measureFiles(buildDirectory, css);
      return [
        route,
        {
          initialJavaScriptGzipBytes: total(
            javaScriptMeasurements,
            "gzipBytes",
          ),
          initialCssGzipBytes: total(cssMeasurements, "gzipBytes"),
          largestInitialAssetGzipBytes: Math.max(
            0,
            ...javaScriptMeasurements.map((entry) => entry.gzipBytes),
            ...cssMeasurements.map((entry) => entry.gzipBytes),
          ),
          javaScriptFiles: javaScriptMeasurements.length,
          cssFiles: cssMeasurements.length,
          selectedDynamicImports:
            routeBudget.selectedDynamicImports?.length ?? 0,
        },
      ];
    }),
  );
  const publicImages = recursiveFiles(publicDirectory)
    .filter((path) =>
      new Set([
        ".avif",
        ".gif",
        ".ico",
        ".jpeg",
        ".jpg",
        ".png",
        ".svg",
        ".webp",
      ]).has(extname(path).toLowerCase()),
    )
    .map((path) => ({ path, bytes: statSync(path).size }));
  return {
    routes,
    publicImages: {
      files: publicImages.length,
      totalBytes: total(publicImages, "bytes"),
      largestBytes: Math.max(0, ...publicImages.map((entry) => entry.bytes)),
    },
  };
}

export function evaluateWebPerformanceBudgets(measurement, budget) {
  validateWebPerformanceBudgetConfiguration(budget);
  const failures = [];
  for (const [route, routeBudget] of Object.entries(budget.routes)) {
    const actual = measurement.routes[route];
    if (!actual) {
      failures.push(`${route}: no measurement was produced`);
      continue;
    }
    compare(
      failures,
      `${route} initial JavaScript (gzip)`,
      actual.initialJavaScriptGzipBytes,
      routeBudget.maximumInitialJavaScriptGzipBytes,
    );
    compare(
      failures,
      `${route} initial CSS (gzip)`,
      actual.initialCssGzipBytes,
      routeBudget.maximumInitialCssGzipBytes,
    );
    compare(
      failures,
      `${route} largest initial asset (gzip)`,
      actual.largestInitialAssetGzipBytes,
      budget.maximumSingleInitialAssetGzipBytes,
    );
  }
  compare(
    failures,
    "public images total",
    measurement.publicImages.totalBytes,
    budget.publicImages.maximumTotalBytes,
  );
  compare(
    failures,
    "largest public image",
    measurement.publicImages.largestBytes,
    budget.publicImages.maximumSingleBytes,
  );
  return failures;
}

function compare(failures, label, actual, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1)
    throw new Error(`${label} has no positive integer budget.`);
  if (actual > maximum)
    failures.push(`${label}: ${actual} bytes exceeds ${maximum} bytes`);
}

function measureFiles(buildDirectory, paths) {
  return [...paths].map((relativePath) => {
    const decodedPath = decodeURIComponent(relativePath);
    const absolutePath = join(buildDirectory, decodedPath);
    if (!existsSync(absolutePath))
      throw new Error(
        `Build manifest references a missing asset: ${relativePath}`,
      );
    const bytes = readFileSync(absolutePath);
    return {
      path: relativePath,
      bytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
    };
  });
}

function readClientReferenceManifest(path) {
  const source = readFileSync(path, "utf8").trim();
  const assignment = source.indexOf("]={");
  if (assignment < 0)
    throw new Error(`Unrecognized client-reference manifest: ${path}`);
  const serialized = source.slice(assignment + 2).replace(/;$/u, "");
  return JSON.parse(serialized);
}

function recursiveFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? recursiveFiles(path) : [path];
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function total(entries, property) {
  return entries.reduce((sum, entry) => sum + entry[property], 0);
}

function main() {
  const budgetFile = resolve(process.argv[2] ?? defaultBudgetFile);
  const buildDirectory = resolve(process.argv[3] ?? defaultBuildDirectory);
  const publicDirectory = resolve(process.argv[4] ?? defaultPublicDirectory);
  const budget = readJson(budgetFile);
  const measurement = measureWebBuild({
    buildDirectory,
    publicDirectory,
    budget,
  });
  const failures = evaluateWebPerformanceBudgets(measurement, budget);
  process.stdout.write(
    `${JSON.stringify({ status: failures.length ? "failed" : "passed", measurement, failures }, null, 2)}\n`,
  );
  if (failures.length) process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  main();
