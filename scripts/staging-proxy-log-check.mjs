import { readFile } from "node:fs/promises";

const logFile = process.argv[2];
if (!logFile)
  throw new Error("Pass the captured staging proxy log file to this check.");

const source = await readFile(logFile, "utf8");
const sentinel = "TREVV_QUERY_SENTINEL_MUST_NOT_APPEAR";
if (source.includes(sentinel))
  throw new Error("The Nginx access log exposed a request query value.");
if (!/GET \/topology\/log-sentinel HTTP\/1\.[01]/u.test(source))
  throw new Error("The sanitized sentinel request was not present in the log.");

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
    apiUpstreams: apiUpstreams.size,
  })}\n`,
);
