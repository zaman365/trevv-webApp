# Overview notices — September 8, 2026

The overview can show two unrelated transient notices:

- **Workspace data may be stale**: the shared background reader encountered an
  error, or its last confirmed snapshot became 15 seconds old. The deployed
  `298d7a7` code polls access every five seconds and allows only one second for
  that read. A delayed request can therefore show a warning which clears after
  a successful read, without any user action. The prepared `db8c379` release
  already allows 4.5 seconds while preserving the five-second access check and
  immediate handling of real authorization failures.
- **Worker status is unavailable**: the overview incorrectly checked whether
  boards had finished loading instead of whether the operations-status request
  had finished. Faster board loading could produce a false error while the
  worker-status request was still pending. The warning then disappeared when
  the status arrived. This follow-up fixes that independent loading state and
  adds a retry action for an actual failed status request.

These are read/status notices. They do not establish whether a task save failed.
The live ZEHN overview had no active warning or captured browser error during
inspection, so the exact notice the user saw was not directly observed.

The slow-response regression failed before the fix. Afterward, all 11 browser
tests in `tests/performance/live-workflow.spec.ts` passed, including slow status
loading, real failure/retry, task creation, assignment, editing, completion,
draft retention, and authorization loss. The product's status visibility and
existing workflows remain available.

This follow-up is a source change, not a live deployment. The previously
published `db8c379` image cohort does not contain it and must be superseded before
shipping this fix. The existing deployment permissions and hosting blockers
remain unresolved.
