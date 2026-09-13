# Shared plans and ideas

Plans and ideas can optionally include collaborators at creation or later. The
existing source record remains the place to manage the work; its private
conversation is the place to discuss it.

## Product behavior

- Dashboard's Create a plan, the project/cycle editor and Quick capture's Idea
  form offer a related team, individually selected people, a select-team option
  and an optional invitation note. Sharing starts off. The creator is included
  automatically; the user must select at least one other person to share.
- The source is saved first. The shared conversation and initial announcement
  then commit together. Selected people see an unread announcement in Messages
  and can reply using the existing conversation tools. This does not send email
  or change the source's existing workspace access.
- A failed or lost sharing response leaves the source saved. A submission journal
  scoped to the signed-in person and organization retains the exact request and
  idempotency key. Retry sharing does not create another source or announcement.
  Reload restores an explicit retry; it does not send automatically.
- Dashboard Summary, its Plans and ideas tab, the live Ideas page and Team
  overview show plans, ideas, people and links to discussions and source details.
  My Work includes ideas assigned to the current person and linked discussions
  they participate in. Full-page navigation remains available.
- Existing sources have Include people / New discussion actions. Existing
  discussions retain participant management, replies, message recovery and
  response workflows. Additional discussions can have different selected groups.
- Team filters select people to include now. Later team membership changes do
  not silently change discussion membership. Each discussion supports up to 250
  participants including its creator. Viewers can be included with read access;
  guests continue to use the existing external-room workflow.
- Inbox-first capture stays available. An idea must be organized directly on a
  board, or converted from Inbox, before starting a linked discussion. The Idea
  form explains this and retains selection while switching destinations.

## Persistence and access

Migration `0025_planning_discussions` adds nullable board and work-item references
to conversations. Scoped foreign keys require the source and room to belong to
one organization and workspace. A check requires at most one source and private
workspace visibility. Existing unlinked rooms are unchanged. Source hard deletion
cascades to its linked discussions; archiving uses existing retention behavior.

CreateConversation accepts optional `context` and `openingMessage`. The server
checks active source and workspace access and validates each participant before
creating the room. Its initial message uses the existing messaging write path,
unread counts, retention scheduling and event journal inside the same transaction.
The DTO and OpenAPI expose context for stable navigation and discovery. No sharing
state or access grant is inferred from browser storage.

## Validation

Coverage includes contract validation; PostgreSQL announcement/replay atomicity,
participant access and replies, rejected foreign sources and deletion behavior;
and browser checks for team selection, optional sharing, recovery after a lost
response, ideas, later invitations, personal/team placement, mobile layout and
conversation navigation. Existing Dashboard, Quick capture and Team workflows
remain regression-covered. Apply the migration with the API release before using
the new live sharing fields.

Verified on September 13, 2026: 373 web unit tests, 31 contract tests, 89 API unit
tests, 46 database unit tests and 23 PostgreSQL collaboration integration tests.
Browser checks passed for 10 sharing scenarios in Chromium and nine in WebKit,
plus the existing Dashboard, Team and Quick capture suites. Lint, API/database
and web type checks, and the web production build passed. No live database was
migrated and no deployment was performed.
