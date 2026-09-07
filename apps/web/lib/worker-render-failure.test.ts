import { describe, expect, it } from "vitest";
import { workerRenderFailure } from "./worker-render-failure";

describe("Worker document recovery", () => {
  it("preserves the requested destination safely and provides recovery without JavaScript", async () => {
    const response = workerRenderFailure(
      new Request(
        "https://trevv.test/app/portfolio?search=%22%3E%3Cscript%3E",
        { headers: { accept: "text/html" } },
      ),
    );
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const html = await response.text();
    expect(html).toContain('action="/app/portfolio"');
    expect(html).toContain('value="&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain("<script>");
    expect(html).toContain('type="submit">Try again');
  });
  it("never returns a successful document or HTML for an RSC/API operation", async () => {
    for (const request of [
      new Request("https://trevv.test/app/portfolio", {
        headers: { rsc: "1", accept: "text/x-component" },
      }),
      new Request("https://trevv.test/api/v1/items", { method: "POST" }),
    ]) {
      const response = workerRenderFailure(request);
      expect(response.status).toBe(500);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      expect(await response.text()).not.toContain("stack");
    }
  });
});
