import { readFile } from "node:fs/promises";

const logFile = process.argv[2];
if (!logFile)
  throw new Error("Pass the captured staging proxy log file to this check.");

const source = await readFile(logFile, "utf8");
const sentinels = [
  "TREVV_QUERY_SENTINEL_MUST_NOT_APPEAR",
  "TREVV_FAILED_UPSTREAM_QUERY_SENTINEL_MUST_NOT_APPEAR",
];
if (sentinels.some((sentinel) => source.includes(sentinel)))
  throw new Error("The Nginx proxy log exposed a request query value.");
if (!/"GET \/topology\/log-sentinel HTTP\/1\.[01]" 204\s/u.test(source))
  throw new Error(
    "The sanitized successful sentinel request was not present in the log.",
  );
const failedUpstreamLine = source
  .split("\n")
  .find((line) =>
    /"GET \/topology\/log-failure-sentinel HTTP\/1\.[01]" 502\s/u.test(line),
  );
if (!failedUpstreamLine)
  throw new Error(
    "The sanitized upstream-failure sentinel request was not present in the log.",
  );
if (!/\supstream=127\.0\.0\.1:1(?:\s|$)/u.test(failedUpstreamLine))
  throw new Error(
    "The upstream-failure sentinel did not exercise its deliberate failed target.",
  );

const apiUpstreams = new Set();
for (const line of source.split("\n")) {
  if (!/"(?:GET|POST|PUT|PATCH|DELETE|HEAD) \/api\/(?:auth|v1)\//u.test(line))
    continue;
  const value = line.match(/\supstream=([^\s]+)/u)?.[1];
  for (const upstream of value?.split(",").map((entry) => entry.trim()) ?? [])
    if (upstream && upstream !== "-") apiUpstreams.add(upstream);
}
if (apiUpstreams.size !== 2)
  throw new Error(
    `Expected public application traffic across two API instances, observed ${apiUpstreams.size}.`,
  );

process.stdout.write(
  `${JSON.stringify({
    status: "ok",
    queryValuesLogged: false,
    failedUpstreamQueryValuesLogged: false,
    apiUpstreams: apiUpstreams.size,
  })}\n`,
);
