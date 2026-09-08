# Daily work product update — September 8, 2026

This change follows the product brief: an easy task and project management tool
combining structured work, team coordination, and conversations across startups.
It extends the persistent application and retains its existing operating-loop,
preview, account, administration, and collaboration routes.

## Daily workflow

- **Portfolio:** organize startups, businesses, clients, and projects as
  workspaces, create their first project board, and start a task directly.
- **All my work:** `/app/my-work` brings assignments from every authorized
  workspace in the selected organization together. Scoped My Work remains
  available within each workspace. Account and organization isolation still
  apply to all reads and confirmed changes.
- **Workspace:** project boards, team and message shortcuts, and a complete
  workspace task list are available together. New task defaults to direct board
  creation and the current user; the assignee, destination, and task type remain
  selectable. Existing Inbox capture and draft recovery remain available.
- **Tasks:** list and status-board views share search, assignee, status,
  workspace, priority, and date filters. Open, today, overdue, upcoming,
  completed, and all-work views use the organization's timezone. Sorting and
  completion progress operate on saved records; incomplete loading is labeled.
  Large lists preserve virtual scrolling.
- **Details:** edit title, description, priority, and deadline; a null deadline
  explicitly clears it. Conflicting edits keep the draft and require an
  explicit choice to apply it to the latest version. Assignment, blocking,
  Waiting, evidence-backed completion, and change history remain available.
  Completed tasks can be reopened while retaining their history and evidence.
- **Updates:** a task update is saved through the existing persistent comment /
  evidence API. Everyone with task access sees it in Updates and evidence;
  foreground refresh brings in colleagues' updates without discarding drafts.
- **Teams:** see member workload, overdue work, and blockers. Team-room links
  open the corresponding authorized conversation. The invitation entry point
  carries the workspace into the invitation form. Lost-response retries retain
  the team-creation request key.

The workspace work list includes work owned by everyone. The team workload view
selects tasks assigned to a team's members within the current workspace; it does
not invent a separate team ownership field for tasks.

## Reliability and compatibility

The earlier repair is documented in `task-workflow-repairs-2026-09-07.md`.
Confirmed writes update the query cache immediately, stale reads cannot undo
them, and recoverable read failures retain the last authorized view. Real
permission loss still clears inaccessible data. Task drawers do not reopen on
background refresh. Team synchronization has a stable status area instead of
inserting a changing page banner. Mobile navigation labels remain on one line.

`PATCH /api/v1/items/:id` accepts `dueDate: null` to remove a deadline, with the
OpenAPI contract updated. The PostgreSQL repository already supports null;
there is no migration or data deletion. The API and Web must be released as a
compatible cohort. Existing clients that send a date or omit the field remain
compatible. The demo adapter also supports deadline clearing.

## Runtime work

Authenticated Render inspection confirmed the three existing services and
database belong to the TREVV workspace. The database is on the Free plan and
expires September 29, 2026. The Render CLI is authenticated, so the locked Mac
does not prevent the Render deployment path.

A proposed new five-minute warming Worker was never deployed: automatic review
rejected its first upload, and subsequent review of the shared 750-hour monthly
Free quota showed that permanently warming three services could exhaust that
quota. That experiment is excluded from this release. The existing checked-in
warming workflow remains available. The proper hosting change requires paid
compute and a persistent database; the concrete proposal is recorded in
`render-persistent-hosting-2026-09-08.md` and requires spending approval.

## Verification

- Browser regressions cover capture, assignment, delayed refresh, failed saves,
  idempotent retries, completion/reopening, status boards, date filters, edit
  conflicts, deadline removal, and task updates.
- Database-backed journeys cover the complete Portfolio → Workspace → Board →
  Task flow, two-account collaboration, faults, evidence, Waiting, weekly
  reviews, and reload persistence. The expanded flow also checks global My Work,
  team workload and room links, invitation workspace selection, and mobile
  accessibility.
- Automated accessibility findings are fixed in the UI; the existing review
  policy and permission checks are not relaxed.

- Web unit tests: 317 passed. API unit tests: 87 passed. API-contract tests:
  25 passed. Repository type checking and lint: all 18 packages passed.
- Browser component, performance, and responsiveness regressions: 30 passed.
- Compiled Cloudflare Worker navigation/performance checks: 14 passed, including
  organization-wide assignments and workspace permission revocation.
- All three real PostgreSQL journeys passed in both Chromium and Safari.
- Final visual review found Safari's native compact selects clipped task status
  text. The shared controls now use consistent sizing and full-width status
  controls on board cards while retaining native keyboard selection behavior.
  All three PostgreSQL Safari journeys passed again after the final select and
  mobile navigation corrections, including the existing accessibility checks.
- Next and Cloudflare production builds and bundle/style budgets passed.

Deployment is pending. Source changes alone do not mean either public domain
has been updated.

Automatic approval review blocked publishing the local source commit to the
existing public `zaman365/trevv-webApp` repository because it requires explicit
user approval of that publication. Repository ownership and administrator
access were verified. Publishing and the matching deployment are awaiting that
approval; the recurring hosting charges require separate approval. No new
release has been pushed or deployed.
