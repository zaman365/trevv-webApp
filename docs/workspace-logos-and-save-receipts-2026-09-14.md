# Workspace logos and save confirmations

Workspace managers can upload a logo in **Workspace settings → Identity and
operating settings → Workspace logo**. PNG, JPG, WebP, GIF and AVIF files up to
10 MB are supported. The browser fits the image without cropping and sends a
small static image; animated sources use a still frame. The API independently
decodes and re-encodes the pixels to WebP, strips metadata, and limits decoded
dimensions and stored size. SVG and arbitrary file payloads are not accepted.

Preview, replace, remove and undo are available before **Save Workspace
settings**. Saving the image and other fields is atomic and uses the existing
manager authorization, version checks, idempotency, audit and refresh flow.
The existing short mark and accent remain available. A shared mark component
shows the logo in workspace navigation, portfolio cards and identity displays;
failed image loads fall back to the short mark.

Migration `0028_workspace_logos` adds a separate, bounded image table with an
organization/workspace foreign key. Workspace lists include only a versioned
relative URL, not image bytes. Authenticated GET requests to
`/api/v1/workspaces/:workspaceId/logo` require workspace read access, return
WebP with `nosniff` and private/no-store caching, and reveal no cross-tenant
image. Removing a logo deletes its stored pixels; workspace deletion cascades.
General file attachments and CSV import retain their existing availability.

Versioned mutations now return `X-TREVV-Resource-Version` alongside the existing
ETag, with CORS exposure and `no-transform`. The shared client validates this
receipt against the parsed saved record. Older APIs remain compatible through
matching strong or weak ETags: a compression proxy's weak marker does not change
TREVV's logical version. Missing, malformed or mismatched receipts still fail;
the client never manufactures a success from the response body alone.

Timestamp version checks compare at the millisecond precision exposed to clients,
including records originally created with PostgreSQL microsecond timestamps.
Successful writes advance the timestamp by at least one millisecond, so genuinely
stale edits still conflict. This covers workspaces, portfolios, boards, comments,
workspace updates and review rituals.

Identical versioned retries reuse the original idempotency key even if a form
supplies a new one. The bounded client cache includes identity, path, method,
expected version and payload; distinct edits and new versions remain distinct.
Creation flows continue to use their existing explicit draft keys.

Focused coverage checks transport receipt variations and invalid receipts,
retry identity, image decoding and limits, tenant isolation, atomic persistence,
replacement/removal, and preservation of existing workspace fields.
