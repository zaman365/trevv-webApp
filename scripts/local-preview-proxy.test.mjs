import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalPreviewProxy } from "./local-preview-proxy.mjs";

test("preview forwards save and version headers and replays one durable receipt across restart", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "trevv-preview-proxy-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const options = {
    origin: "http://127.0.0.1:4180",
    receiptsPath: join(dir, "receipts.json"),
    fetchImpl: async (_url, init) => {
      calls++;
      assert.equal(init.headers.get("idempotency-key"), "save-one");
      assert.equal(init.headers.get("if-match"), '"1"');
      assert.equal(init.headers.get("host"), null);
      return Response.json(
        { id: "saved-item", version: 2 },
        { status: 200, headers: { etag: '"2"', "x-request-id": "trace-one" } },
      );
    },
  };
  const input = {
    path: "/api/v1/items/item-one",
    method: "PATCH",
    headers: {
      host: "preview",
      "if-match": '"1"',
      "idempotency-key": "save-one",
    },
    body: Buffer.from('{"title":"Demo Task"}'),
  };
  const proxy = await createLocalPreviewProxy(options);
  const [first, repeated] = await Promise.all([proxy(input), proxy(input)]);
  assert.equal(first.headers.etag, '"2"');
  assert.equal(first.headers["x-request-id"], "trace-one");
  assert.equal(repeated.headers["idempotency-replayed"], "true");
  const restarted = await createLocalPreviewProxy(options);
  assert.equal(
    (await restarted(input)).headers["idempotency-replayed"],
    "true",
  );
  assert.equal(calls, 1);
  assert.equal(
    (await restarted({ ...input, body: Buffer.from('{"title":"Changed"}') }))
      .status,
    409,
  );
  assert.equal(calls, 1);
});

test("failed preview saves are retried and their error details retained", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "trevv-preview-error-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let calls = 0;
  const proxy = await createLocalPreviewProxy({
    origin: "http://127.0.0.1:4180",
    receiptsPath: join(dir, "receipts.json"),
    fetchImpl: async () => {
      calls++;
      return Response.json(
        { error: { message: "Try again" } },
        { status: 503, headers: { "retry-after": "2" } },
      );
    },
  });
  const input = {
    path: "/api/v1/items",
    method: "POST",
    headers: { "idempotency-key": "save-two" },
    body: Buffer.from("{}"),
  };
  assert.equal((await proxy(input)).headers["retry-after"], "2");
  await proxy(input);
  assert.equal(calls, 2);
});
