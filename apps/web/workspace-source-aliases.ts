import { fileURLToPath } from "node:url";

// Web bundlers compile these workspace sources themselves. Their `production`
// exports are for packaged Node services and may contain an older local build.
// Resolve exact public entry points so standalone web builds cannot mix versions.
export const workspaceSourceEntries = {
  "@founderhq/api-contract": "api-contract/src/index.ts",
  "@founderhq/api-contract/openapi": "api-contract/src/openapi.ts",
  "@founderhq/api-contract/superadmin": "api-contract/src/superadmin.ts",
  "@founderhq/api-contract/report-plan": "api-contract/src/report-plan.ts",
  "@founderhq/core": "core/src/index.ts",
};

export const workspaceSourceAliases = Object.entries(
  workspaceSourceEntries,
).map(([name, path]) => ({
  find: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
  replacement: fileURLToPath(
    new URL(`../../packages/${path}`, import.meta.url),
  ),
}));

export const webpackWorkspaceSourceAliases = Object.fromEntries(
  Object.entries(workspaceSourceEntries).map(([name, path]) => [
    `${name}$`,
    fileURLToPath(new URL(`../../packages/${path}`, import.meta.url)),
  ]),
);
