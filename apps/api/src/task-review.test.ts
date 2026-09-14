import { describe, expect, it } from "vitest";
import { createDemoApiApp } from "./app.js";

describe("task review API", () => {
  it("validates commands and save receipts, replays a request, and preserves review history through completion", async () => {
    const app = createDemoApiApp();
    const headers = (version: number, key = crypto.randomUUID()) => ({
      "content-type": "application/json",
      "if-match": `"${version}"`,
      "idempotency-key": key,
    });
    const created = await app.request("/api/v1/items", {
      method: "POST",
      headers: headers(0),
      body: JSON.stringify({
        workspaceId: "workspace-northstar",
        boardId: "b-northstar-launch",
        title: "Review test",
        description: "Ready to review",
        type: "task",
        priority: "normal",
        status: "working",
        assigneeIds: ["user-owner"],
      }),
    });
    expect(created.status).toBe(201);
    const item = await created.json();
    const path = `/api/v1/items/${item.id}/review`;
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(428);
    expect(
      (
        await app.request(path, {
          method: "POST",
          headers: headers(0),
          body: JSON.stringify({
            action: "request",
            reviewerIds: [],
            note: "Check",
          }),
        })
      ).status,
    ).toBe(422);
    const key = crypto.randomUUID();
    const body = JSON.stringify({
      action: "request",
      reviewerIds: ["user-owner"],
      note: "Check the result https://drive.google.com/example",
    });
    const sent = await app.request(path, {
      method: "POST",
      headers: headers(0, key),
      body,
    });
    expect(sent.status).toBe(200);
    expect(sent.headers.get("etag")).toBe('"1"');
    const reviewItem = await sent.json();
    const replay = await app.request(path, {
      method: "POST",
      headers: headers(0, key),
      body,
    });
    expect(replay.headers.get("idempotency-replayed")).toBe("true");
    expect(await replay.json()).toEqual(reviewItem);
    const premature = await app.request(`/api/v1/items/${item.id}/resolve`, {
      method: "POST",
      headers: headers(1),
      body: JSON.stringify({ evidence: "Done" }),
    });
    expect(premature.status).toBe(409);
    expect((await premature.json()).error.message).toContain("All reviewers");
    const approved = await app.request(path, {
      method: "POST",
      headers: headers(1),
      body: JSON.stringify({
        action: "respond",
        roundId: reviewItem.review.id,
        decision: "approved",
        note: "Checked all results",
      }),
    });
    expect(approved.status).toBe(200);
    expect((await approved.json()).review.state).toBe("approved");
    const done = await app.request(`/api/v1/items/${item.id}/resolve`, {
      method: "POST",
      headers: headers(2),
      body: JSON.stringify({ evidence: "Delivered the reviewed outcome" }),
    });
    expect(done.status).toBe(200);
    const history = await (
      await app.request(`/api/v1/items/${item.id}/history`)
    ).json();
    expect(
      history.filter((entry: { reasonCode: string }) =>
        entry.reasonCode.startsWith("review_"),
      ).length,
    ).toBe(2);
  });
});
