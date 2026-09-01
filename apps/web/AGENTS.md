<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Feature-preservation invariant

The repository-level `AGENTS.md` applies to this application. In particular,
do not delete, hide, disable, trim, de-scope, or silently replace any existing
or documented Web feature unless the user explicitly requests that exact
removal in a plain-language message. Fixes and redesigns must preserve behavior
and discoverability, compose overlapping surfaces, and add regression coverage
for route or runtime-mode decisions that could bypass an existing capability.
