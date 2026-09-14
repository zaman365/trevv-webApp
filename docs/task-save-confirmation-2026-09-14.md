# Task save confirmation and preview retries

The local interface preview forwarded task bodies but dropped the API's `ETag`,
`Idempotency-Key`, `Idempotency-Replayed`, and request trace headers. A successful
201 response therefore failed client validation and appeared as an unconfirmed
save. Repeating that write against the sample API could create another task.

Local sample preview bridges now use `scripts/local-preview-proxy.mjs`. It is
restricted to a loopback upstream, forwards request and response metadata, and
persists successful mutation receipts at the configured local path. Identical
retries return the same receipt, including after a bridge restart; changed
payloads cannot reuse that key. Keep the sample data server and its receipt file
together. This helper is for local samples only, not a production persistence
or authentication layer. Production idempotency remains enforced by the API
and database; the browser API proxy preserves its headers.

The client retains strict resource/version validation. Missing or invalid
receipts and unreadable server responses now have specific, safe error messages.
Interrupted connections do not claim that nothing was saved. Invalid task input
is explained before a request is sent. Task capture keeps the original retry key
when an unchanged field is selected, retains drafts across reload, and requires
an explicit board choice if the draft's original board is no longer available.

Regression coverage: API client response/input tests, browser proxy header
tests, local preview receipt replay tests, and task capture browser tests for
lost connections, missing receipts, invalid responses, recovered boards, all
capture types, Inbox capture, and desktop/mobile layouts.

The running local preview was verified with a labeled sample task and an
identical replay: one task, a valid version receipt, and a replay acknowledgement.
No production deployment or authenticated live-account save was performed for
this fix.
