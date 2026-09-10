# Report and plan

Workspace navigation includes **Report and plan** after Calendar. The route is
`/app/workspaces/:workspaceSlug/report-plan`. Existing My Work, project/sprint
planning and the workspace-wide weekly review remain available; the new page
links to the weekly review.

Members can write progress reports covering current work, completed actions and
outcomes, blockers, support needed and next steps. Plans cover goals, prioritized
actions, success criteria, dependencies, blockers and support. Both support daily,
weekly, monthly, sprint and custom inclusive date ranges and optional project or
sprint context. Context is a text reference, not an automatically linked board.
Quick dates use the organization timezone; weeks start on Monday.

Drafts are saved to PostgreSQL in live mode and visible only to their author,
including when another user has an organization owner or administrator role.
Publishing explicitly shares an update with people who have workspace read
access. Guests and viewers can read published updates but cannot write them.
Only the author can edit or archive their updates. Published updates remain
shared when edited. Archiving removes an update from the active feed without
deleting its database record. Private drafts are excluded from other users'
organization repository exports. The work-data privacy inventory includes these
records; existing retention enforcement limitations are unchanged.

Filters cover report/plan, member, visibility, overlapping dates and needs
attention (at risk, blocked, blockers supplied or support requested). Results are
filtered before pagination, with 24 updates per page. Data is refreshed on focus
and every 30 seconds while the live page is open. These are self-authored updates;
no background employee activity tracking or inferred completion history is added.

Members can copy an update as text and reuse their own plan for the next period.
Reusing a plan creates a new private draft with fresh dates; it keeps goals,
actions, success criteria and dependencies, and clears previous progress,
blockers and support requests. Users review the draft before publishing it.

The API exposes GET/POST `/api/v1/workspaces/:workspaceId/report-plans` and
GET/PATCH/DELETE `/api/v1/report-plans/:id` (DELETE archives). Writes use existing
session, CSRF, body-limit and rate-limit middleware, require Idempotency-Key, and
PATCH/DELETE require the quoted record version in If-Match. Database transactions
protect idempotency and version checks. Audit events contain identifiers and
state metadata, not report content. Input schemas reject client-chosen tenant,
workspace or author identifiers. Publishing requires meaningful report progress,
or a plan goal and actions. No messages or email notifications are sent.

Demo mode has a separate browser-only store and an explicit notice. It never
writes to live APIs or shares updates with real members. The demo API reports
that server persistence requires a live account.

Migration `0024_wild_jamie_braddock.sql` adds the `member_report_plans` table. Apply
it before enabling this code in a live environment. No previous table is changed.
