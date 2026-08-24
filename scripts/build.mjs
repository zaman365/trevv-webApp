import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const userAgent = process.env.npm_config_user_agent ?? "";
const hostedNpmBuild = userAgent.startsWith("npm/");
const command = hostedNpmBuild ? "npm" : "turbo";
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
