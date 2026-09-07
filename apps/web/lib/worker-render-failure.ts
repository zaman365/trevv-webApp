function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

/** Last-resort document recovery when an adapter fails before rendering global-error. */
export function workerRenderFailure(request: Request): Response {
  const url = new URL(request.url);
  const isDocument =
    request.method === "GET" &&
    !url.pathname.startsWith("/api/") &&
    request.headers.get("rsc") !== "1" &&
    !request.headers.get("accept")?.includes("text/x-component") &&
    request.headers.get("accept")?.includes("text/html");
  const headers = {
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
  };
  if (!isDocument)
    return Response.json(
      {
        error: {
          code: "render_unavailable",
          message: "The page could not be loaded. Please try again.",
        },
      },
      { status: 500, headers },
    );
  const fields = [...url.searchParams]
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join("");
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>TREVV could not start</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:#f6f7fb;color:#202536;font:16px system-ui,sans-serif}main{width:min(100%,510px);padding:24px;box-sizing:border-box;background:white;border:1px solid #dfe3ec;border-radius:16px}h1{font-size:1.25rem}p{line-height:1.55;color:#5f687c}button{padding:10px 14px;background:#5148c8;color:white;border:0;border-radius:9px;font:inherit;font-weight:700;cursor:pointer}button:focus-visible{outline:3px solid #a8a1ee;outline-offset:3px}</style></head><body><main role="alert"><h1>TREVV could not start</h1><p>The application could not be loaded. Try loading this page again.</p><form method="get" action="${escapeHtml(url.pathname)}">${fields}<button type="submit">Try again</button></form></main></body></html>`,
    {
      status: 500,
      headers: {
        ...headers,
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}
