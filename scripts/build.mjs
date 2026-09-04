import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceTurbo = resolve(repositoryRoot, "node_modules", ".bin", "turbo");

const userAgent = process.env.npm_config_user_agent ?? "";
const hostedNpmBuild = userAgent.startsWith("npm/");
// Resolve the workspace binary directly so `node scripts/build.mjs` works
// outside a pnpm-provided PATH; fall back to PATH lookup when it is absent.
const command = hostedNpmBuild
  ? "npm"
  : existsSync(workspaceTurbo)
    ? workspaceTurbo
    : "turbo";
const args = hostedNpmBuild
  ? ["--prefix", "apps/web", "run", "build:sites"]
  : ["run", "build"];

const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

if (hostedNpmBuild) {
  const source = resolve("apps/web/dist");
  const target = resolve("dist");
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}
