import { spawnSync } from "node:child_process";

const allowedUnpatched = new Map([
  [
    "GHSA-w3rx-r6r6-pgpr",
    "Expo/Metro image-size ICNS parser; no patched npm release exists yet",
  ],
  [
    "GHSA-5p2g-fcmc-qvqq",
    "Expo/Metro image-size JXL/HEIF parsers; no patched npm release exists yet",
  ],
]);

const result = spawnSync("pnpm", ["audit", "--json"], {
  encoding: "utf8",
  maxBuffer: 20 * 1024 * 1024,
});
if (!result.stdout.trim()) {
  console.error(result.stderr || "Dependency audit returned no report.");
  process.exit(1);
}

let report;
try {
  report = JSON.parse(result.stdout);
} catch {
  console.error("Dependency audit returned invalid JSON.");
  process.exit(1);
}

const advisories = Object.values(report.advisories ?? {});
const blocking = [];
const allowed = [];

for (const advisory of advisories) {
  if (!["high", "critical"].includes(advisory.severity)) continue;
  const id = advisory.github_advisory_id;
  const paths =
    advisory.findings?.flatMap((finding) => finding.paths ?? []) ?? [];
  const expoMetroOnly =
    paths.length > 0 &&
    paths.every(
      (path) => path.includes("apps__mobile") && path.includes("metro"),
    );
  if (
    allowedUnpatched.has(id) &&
    advisory.module_name === "image-size" &&
    expoMetroOnly
  ) {
    allowed.push({
      id,
      title: advisory.title,
      reason: allowedUnpatched.get(id),
    });
  } else {
    blocking.push({
      id,
      severity: advisory.severity,
      module: advisory.module_name,
      title: advisory.title,
    });
  }
}

for (const entry of allowed)
  console.warn(`ALLOWLISTED ${entry.id}: ${entry.reason}`);
if (blocking.length) {
  console.error("Blocking dependency advisories:");
  for (const entry of blocking)
    console.error(
      `${entry.severity.toUpperCase()} ${entry.id} ${entry.module}: ${entry.title}`,
    );
  process.exit(1);
}

console.log(
  `Dependency audit passed: ${advisories.length} total advisories, ${allowed.length} narrowly allowlisted, no other high/critical findings.`,
);
