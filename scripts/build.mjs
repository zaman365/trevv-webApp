import { spawnSync } from "node:child_process";

const userAgent = process.env.npm_config_user_agent ?? "";
const hostedNpmBuild = userAgent.startsWith("npm/");
const command = hostedNpmBuild ? "npm" : "turbo";
const args = hostedNpmBuild
  ? ["--prefix", "apps/web", "run", "build"]
  : ["run", "build"];

const result = spawnSync(command, args, { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
