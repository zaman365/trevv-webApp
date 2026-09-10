import assert from "node:assert/strict";
import test from "node:test";
import { northflankClientIp, northflankFetch } from "./api-entry.mjs";

test("direct callers cannot forge a Cloudflare client or an earlier proxy hop", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.41.128.1, 192.0.2.7, 203.0.113.8",
    "cf-connecting-ip": "192.0.2.99",
    "x-real-ip": "192.0.2.99",
  });
  assert.equal(northflankClientIp(headers), "203.0.113.8");
});

test("verified Cloudflare peers carry individual IPv4 and IPv6 clients", () => {
  for (const peer of ["172.64.0.1", "2606:4700::123"]) {
    for (const client of ["203.0.113.7", "2001:db8::7"]) {
      assert.equal(northflankClientIp(new Headers({ "x-forwarded-for": `192.0.2.5, ${peer}`, "cf-connecting-ip": client })), client);
    }
  }
  assert.equal(northflankClientIp(new Headers({ "x-forwarded-for": "2001:db8::8", "cf-connecting-ip": "192.0.2.99" })), "2001:db8::8");
});

test("malformed or missing trusted-hop identities fail closed", () => {
  for (const value of [undefined, "", "203.0.113.1,", "bad", "203.0.113.1:443"]) {
    const headers = new Headers();
    if (value !== undefined) headers.set("x-forwarded-for", value);
    assert.throws(() => northflankClientIp(headers));
  }
  for (const value of [undefined, "", "192.0.2.1, 192.0.2.2", "bad"]) {
    const headers = new Headers({ "x-forwarded-for": "172.64.0.1" });
    if (value !== undefined) headers.set("cf-connecting-ip", value);
    assert.throws(() => northflankClientIp(headers));
  }
});

test("forwarding preserves bodies, authorization, cookies, query strings and streaming responses", async () => {
  const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("event: kept\n\n")); controller.close(); } }), { headers: { "content-type": "text/event-stream", "set-cookie": "session=retained; Secure; HttpOnly" } });
  let calls = 0;
  const fetch = northflankFetch(async (request, context) => {
    calls++;
    assert.equal(context, "preserved");
    assert.equal(request.url, "https://api.example/api/v1/tasks?q=keep");
    assert.equal(request.method, "POST");
    assert.equal(await request.text(), '{"title":"Preserve this task"}');
    assert.equal(request.headers.get("authorization"), "Bearer retained");
    assert.equal(request.headers.get("cookie"), "session=retained");
    assert.equal(request.headers.get("x-superadmin-invitation"), "retained");
    for (const header of ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"]) assert.equal(request.headers.get(header), "203.0.113.9");
    assert.equal(request.headers.get("forwarded"), null);
    assert.equal(request.headers.get("true-client-ip"), null);
    return response;
  });
  const result = await fetch(new Request("https://api.example/api/v1/tasks?q=keep", {
    method: "POST", body: '{"title":"Preserve this task"}',
    headers: { "x-forwarded-for": "192.0.2.5, 203.0.113.9", "cf-connecting-ip": "192.0.2.99", forwarded: "for=192.0.2.99", "true-client-ip": "192.0.2.99", authorization: "Bearer retained", cookie: "session=retained", "x-superadmin-invitation": "retained" },
  }), "preserved");
  assert.equal(calls, 1);
  assert.equal(result, response);
  assert.equal(await result.text(), "event: kept\n\n");
  assert.equal(result.headers.get("set-cookie"), "session=retained; Secure; HttpOnly");
});

test("only existing GET/HEAD health routes bypass missing ingress metadata", async () => {
  let calls = 0;
  const fetch = northflankFetch(() => { calls++; return new Response("healthy"); });
  for (const path of ["/api/v1/health", "/api/v1/readyz"]) {
    for (const method of ["GET", "HEAD"]) assert.equal((await fetch(new Request(`http://localhost${path}`, { method }))).status, 200);
    assert.equal((await fetch(new Request(`http://localhost${path}`, { method: "POST" }))).status, 403);
  }
  for (const path of ["/api/superadmin/auth/get-session", "/api/v1/tasks", "/api/v1/health/extra", "/openapi.json"])
    assert.equal((await fetch(new Request(`http://localhost${path}`))).status, 403);
  assert.equal(calls, 4);
});
