export type BoundedRequestBody =
  { status: "ok"; bytes: Uint8Array<ArrayBuffer> } | { status: "too_large" };

/**
 * Read a request without trusting Content-Length and without buffering past
 * the supplied boundary. This protects direct Next/Worker deployments as
 * well as the repository-owned reverse proxy topology.
 */
export async function readBoundedRequestBody(
  request: Request,
  maximumBytes: number,
): Promise<BoundedRequestBody> {
  const declared = request.headers.get("content-length");
  if (declared) {
    const parsed = Number(declared);
    if (Number.isFinite(parsed) && parsed > maximumBytes)
      return { status: "too_large" };
  }
  if (!request.body)
    return { status: "ok", bytes: new Uint8Array(new ArrayBuffer(0)) };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("payload_too_large").catch(() => undefined);
      return { status: "too_large" };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok", bytes };
}
