import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceViews = [
  "dashboard",
  "calendar",
  "attention",
  "my-work",
  "inbox",
  "messages",
  "decisions",
  "approvals",
  "ideas",
  "reviews",
  "waiting",
  "teams",
  "blueprints",
  "notifications",
  "search",
  "settings",
];
const liveWorkFeatures = {
  "my-work": "my-work",
  attention: "attention",
  waiting: "waiting",
  decisions: "transitions",
  approvals: "transitions",
  reviews: "reviews",
  search: "search",
  inbox: "inbox",
  settings: "settings",
};
// Keep the live implementation explicit: Settings is LiveWorkView, not its demo.
export const workerRouteEntrypoints = Object.freeze({
  "/sign-in": ["auth-experience"],
  "/app/portfolio": ["portfolio-loader", "live-portfolio-experience"],
  "/app/workspaces/:workspace": [
    "workspace-module-loader",
    "live-workspace-dashboard",
  ],
  ...Object.fromEntries(
    workspaceViews.map((view) => [
      `/app/workspaces/:workspace/${view}`,
      [
        "workspace-module-loader",
        view === "calendar"
          ? "calendar-experience"
          : view === "dashboard"
            ? "live-workspace-dashboard"
            : view === "messages"
              ? "live-messaging-workspace"
              : view === "teams"
                ? "live-team-workflow"
                : "live-work-views",
        ...(liveWorkFeatures[view]
          ? [`live-work-${liveWorkFeatures[view]}`]
          : []),
        ...(view === "inbox" ? ["email-inbox-workflow"] : []),
      ],
    ]),
  ),
  "/app/workspaces/:workspace/boards/:board": [
    "board-loader",
    "live-board-experience",
  ],
  "/app/workspaces/:workspace/settings/import": ["management-experience"],
  "/app/workspaces/:workspace/stakeholder": ["stakeholder-experience"],
  "/app/account/sessions": ["session-management"],
  "/app/account/privacy": ["privacy-center"],
  "/app/account/invitations": ["invitation-management"],
  "/app/system/admin": ["platform-admin"],
  "/app/mail": ["email-inbox-workflow"],
});

export function staticModuleImports(source) {
  const parsed = ts.createSourceFile(
    "chunk.js",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  return parsed.statements.flatMap((statement) => {
    if (
      (ts.isImportDeclaration(statement) ||
        ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    )
      return [statement.moduleSpecifier.text];
    return [];
  });
}

export function validateWorkerBudgets(budgets) {
  const expected = Object.keys(workerRouteEntrypoints);
  if (
    budgets.version !== 1 ||
    !budgets.routes ||
    Object.keys(budgets.routes).length !== expected.length ||
    expected.some((route) => !Object.hasOwn(budgets.routes, route))
  )
    throw new Error("Worker budgets must cover every canonical live route.");
  for (const value of Object.values(budgets.routes))
    if (
      ![value.javascriptGzipBytes, value.cssGzipBytes].every(
        (n) => Number.isFinite(n) && n > 0,
      )
    )
      throw new Error("Worker budgets must be positive byte limits.");
}

export function measureWorkerBuild(
  buildDirectory = resolve(root, "apps/web/dist"),
) {
  const client = resolve(buildDirectory, "client");
  const chunks = resolve(client, "_next/static/chunks");
  const filenames = readdirSync(chunks);
  const source = readFileSync(
    resolve(buildDirectory, "server/__vite_rsc_assets_manifest.js"),
    "utf8",
  );
  const manifest = JSON.parse(
    source
      .replace(/^export default\s*/, "")
      .trim()
      .replace(/;$/, ""),
  );
  const assetPath = (url) => {
    const path = resolve(client, url.replace(/^\//, ""));
    if (relative(client, path).startsWith("..") || !existsSync(path))
      throw new Error(`Missing or invalid Worker asset: ${url}`);
    return path;
  };
  const namedChunk = (name) => {
    const matches = filenames.filter(
      (file) => file.startsWith(`${name}-`) && file.endsWith(".js"),
    );
    if (matches.length !== 1)
      throw new Error(
        `Expected one shipped chunk for ${name}; got ${matches.length}.`,
      );
    return resolve(chunks, matches[0]);
  };
  const imports = new Map();
  const closure = (initial) => {
    const visited = new Set();
    const visit = (path) => {
      if (visited.has(path)) return;
      visited.add(path);
      let dependencies = imports.get(path);
      if (!dependencies) {
        dependencies = staticModuleImports(readFileSync(path, "utf8"));
        imports.set(path, dependencies);
      }
      for (const dependency of dependencies) {
        if (!dependency.startsWith("."))
          throw new Error(`Unbundled Worker client dependency: ${dependency}`);
        const next = resolve(dirname(path), dependency);
        if (relative(client, next).startsWith("..") || !existsSync(next))
          throw new Error(`Missing client import ${dependency}`);
        if (next.endsWith(".js")) visit(next);
      }
    };
    initial.forEach(visit);
    return visited;
  };
  const gzip = (paths) =>
    [...paths].reduce(
      (sum, path) =>
        sum + gzipSync(readFileSync(path), { level: 9 }).byteLength,
      0,
    );
  return Object.fromEntries(
    Object.entries(workerRouteEntrypoints).map(([route, modules]) => {
      const initial = [
        assetPath(manifest.clientEntryUrl),
        namedChunk("web-vitals-reporter"),
        namedChunk("service-worker-registration"),
        ...modules.map(namedChunk),
      ];
      if (route.startsWith("/app/"))
        initial.push(namedChunk("app-shell-providers"));
      const js = closure(initial);
      const css = new Set();
      for (const [resource, assets] of Object.entries(manifest.serverResources))
        if (
          resource === "app/layout.tsx" ||
          (route.startsWith("/app/") && resource === "app/app/layout.tsx")
        )
          (assets.css ?? []).forEach((path) => css.add(assetPath(path)));
      for (const assets of Object.values(manifest.clientReferenceDeps))
        if (assets.js?.[0] && js.has(assetPath(assets.js[0])))
          (assets.css ?? []).forEach((path) => css.add(assetPath(path)));
      return [
        route,
        {
          javascriptGzipBytes: gzip(js),
          cssGzipBytes: gzip(css),
          javascriptFiles: js.size,
          cssFiles: css.size,
        },
      ];
    }),
  );
}

export function enforceWorkerBudgets(measurements, budgets) {
  validateWorkerBudgets(budgets);
  const failures = [];
  for (const [route, limits] of Object.entries(budgets.routes))
    for (const key of ["javascriptGzipBytes", "cssGzipBytes"])
      if (!measurements[route] || measurements[route][key] > limits[key])
        failures.push(
          `${route} ${key}: ${measurements[route]?.[key] ?? "missing"} > ${limits[key]}`,
        );
  if (failures.length) throw new Error(failures.join("\n"));
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const budgets = JSON.parse(
    readFileSync(
      resolve(root, "config/worker-performance-budgets.json"),
      "utf8",
    ),
  );
  const measurements = measureWorkerBuild();
  enforceWorkerBudgets(measurements, budgets);
  console.log(
    JSON.stringify({ runtime: "vinext-worker", measurements }, null, 2),
  );
}
