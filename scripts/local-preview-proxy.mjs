import { readFile, writeFile, rename } from "node:fs/promises";

/** Loopback sample previews must retain the same save receipts as the real API. */
export async function createLocalPreviewProxy({
  origin,
  receiptsPath,
  fetchImpl = fetch,
}) {
  const upstreamOrigin = new URL(origin);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(upstreamOrigin.hostname))
    throw new Error("The sample preview proxy only supports a local upstream.");
  let receipts = {};
  try {
    receipts = JSON.parse(await readFile(receiptsPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  let queue = Promise.resolve();

  return function proxy({ path, method, headers: incomingHeaders, body }) {
    // Serialize sample writes so repeated clicks share the first saved receipt.
    const run = async () => {
      const target = new URL(path, upstreamOrigin);
      if (target.origin !== upstreamOrigin.origin)
        throw new Error("Preview requests must stay on the local upstream.");
      const headers = new Headers(incomingHeaders);
      for (const name of [
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
      ])
        headers.delete(name);
      const key = headers.get("idempotency-key");
      headers.set("accept-encoding", "identity");
      const cacheKey =
        key && !["GET", "HEAD", "OPTIONS"].includes(method)
          ? `${method}:${path}:${key}`
          : null;
      const fingerprint = `${headers.get("if-match") ?? ""}:${body.toString()}`;
      if (cacheKey && receipts[cacheKey]) {
        const saved = receipts[cacheKey];
        if (saved.fingerprint !== fingerprint)
          return {
            status: 409,
            headers: {
              "content-type": "application/json",
              "cache-control": "no-store",
            },
            body: JSON.stringify({
              error: {
                code: "idempotency_conflict",
                message: "This save key belongs to another change.",
                requestId: "local-preview",
              },
            }),
          };
        return {
          ...saved.result,
          headers: { ...saved.result.headers, "idempotency-replayed": "true" },
        };
      }
      const response = await fetchImpl(target, {
        method,
        headers,
        ...(body.length ? { body } : {}),
      });
      const responseHeaders = Object.fromEntries(response.headers);
      for (const name of [
        "connection",
        "content-length",
        "content-encoding",
        "transfer-encoding",
      ])
        delete responseHeaders[name];
      responseHeaders["cache-control"] = "no-store, no-transform";
      const result = {
        status: response.status,
        headers: responseHeaders,
        body: response.headers.get("content-type")?.startsWith("image/")
          ? Buffer.from(await response.arrayBuffer())
          : await response.text(),
      };
      if (cacheKey && response.ok) {
        result.headers["idempotency-key"] = key;
        result.headers["idempotency-replayed"] ??= "false";
        receipts[cacheKey] = { fingerprint, result };
        await writeFile(`${receiptsPath}.tmp`, JSON.stringify(receipts));
        await rename(`${receiptsPath}.tmp`, receiptsPath);
      }
      return result;
    };
    const next = queue.then(run);
    queue = next.catch(() => {});
    return next;
  };
}
