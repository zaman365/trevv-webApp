# Attention issue workspace

## Behavior

The live Attention list now opens a centered, scrollable detail overlay from an
issue title, card background or Resolve button. Source evidence, identifiers,
reason codes and detection metadata remain accessible. URLs use an encoded
`#issue=` identifier, with reload, Back/Forward and keyboard focus support.

Resolve selects the workflow for the issue's cause. Existing WorkItem controls
are embedded in the overlay, retaining assignment, planning, deadlines, status,
blocking, evidence, completion/reopening, waiting and history. Decision and
approval transitions and existing waiting records are composed alongside them.
Workspace-update issues embed the existing weekly-review publisher, which
persists a workspace update and queues Attention recomputation.

Follow-up creation reuses capture with a separate issue draft and contextual
description. Communication can reuse or create a direct conversation, send to
an existing accessible room, or request a response/decision with an owner and
optional deadline. Email drafting creates an encoded mailto link for review in
the user's mail app. Sending messages and creating work are explicit actions;
they do not dismiss or resolve the signal.

The outcome form retains explicit signal resolution, snooze and dismissal.
Reasons are required before confirmation. Snooze uses the action's current time,
not the last data-refresh timestamp. Failed sends and issue actions retain
their drafts and retry identity. Source access loss removes the loaded issue
content and actions.

## Confirmation handling

Previously, Resolve immediately attempted a signal mutation, and the signal
mutation and subsequent refresh shared one error path. The new list-level
Resolve is navigation only. Explicit outcome confirmation reports acknowledged
writes independently from later refreshes. Missing or malformed confirmation is
presented as uncertain, with Load latest and a safe retry. A missing signal in
the latest active list is reported as no longer active, without claiming that
an uncertain write failed. Version conflicts retain review/reapply controls.

The exact response behind the supplied screenshot was not available locally.
The regression scenarios reproduce service failures, missing confirmation
headers after a saved action, and recomputed versions to verify each recovery
path. The API's validation, version and authorization checks remain in force.

## Preservation and validation

Shared task dialogs and capture retain their standalone behavior; embedding is
optional. The existing Teams worktree changes and fictional demo Attention
experience remain intact. No API schema or database migration was needed.

Browser verification uses the actual client components with isolated fixture
APIs, including mutations and error recovery.

Validation completed on 2026-09-13:

- All 369 Web unit tests passed.
- All 40 Chromium browser tests passed: 12 issue-workspace cases and 28 existing
  task, dashboard, team and summary-card workflows.
- All 12 issue-workspace cases passed on WebKit.
- Mobile light/dark checks passed for issue details, task resolution,
  follow-up creation and communication, including automated accessibility,
  overflow, visible close controls and keyboard focus. Desktop/light and
  mobile/dark overlay screenshots were visually reviewed.
- Web lint, TypeScript, formatting and the production Next.js build passed.
  The build used explicit live-mode settings with HTTPS test origins.

The implementation is local and uncommitted. It has not been deployed, and test
messages and mutations used fixture APIs rather than user conversations.
