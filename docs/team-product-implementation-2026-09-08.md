# Team and project workflow implementation

The user reported that task assignment and adding team members are unusable,
team management is dominated by configuration, and department context, topics,
sprints and milestones are difficult or absent. This work must validate actual
collaboration outcomes, not only that a screen loads.

## Acceptance journeys

- Create a team, add an existing eligible person, invite a new person directly
  into that team, accept the invitation, and assign that person a task.
- Create tasks directly without an Inbox step; retain existing captures and
  their recovery/conversion paths.
- Open a team, see people and their work, and keep separate named discussion
  topics with replies. Membership continues to control access.
- Use department-specific project templates and work context for Marketing,
  Technology, Sales, Operations and Leadership.
- Plan dated sprints/campaigns, track milestones and owners, and manage daily
  follow-ups and weekly reviews against saved records.
- Follow an in-product step-by-step guide from startup/project setup through
  people, assignments, collaboration, planning, daily work and review.

Preserve established routes, demo behavior, permission boundaries, idempotency,
version conflict handling, and recoverable drafts. Add database-backed and
browser regression coverage for the complete journeys, including narrow screens.

## Delivered behavior

- Task creation starts with a project and assignee. An inline invitation flow
  explains how to add someone who is missing from the directory. Existing Inbox
  captures remain available as an optional path, with their recovery and conversion
  behavior preserved.
- Team management opens on People, with existing-member selection, invitations,
  roles and membership controls. Projects and work, Topics and discussions, and
  Settings have separate tabs. Team/profile conflicts preserve the user's draft.
- Marketing, Technology, Sales, Operations and Leadership have purpose, project
  templates, work categories and context fields appropriate to their work.
- Projects contain dated sprints/campaigns and milestone-linked tasks. Team,
  cycle, milestone, topic, estimate, acceptance criteria and department context
  survive creation, assignment, editing and Inbox conversion. Task details show
  this context without requiring Edit.
- Named team topics and threaded replies use existing server-saved team rooms
  and membership rules. Topic and reply drafts recover after closing the drawer.
- Projects & sprints and Getting started are discoverable from the workspace
  navigation. The eight-step in-product guide is also available in
  [How to use TREVV](how-to-use-trevv.md).
- Mobile layouts keep task and planning actions reachable, constrain guide width,
  and remove the closed sidebar from keyboard and accessibility navigation.

## Validation

Local validation used isolated PostgreSQL databases and fake email recipients;
no real people were invited or messaged.

- Web unit tests: 323 passed. API unit tests: 88 passed. Contract/client tests:
  27 and 15 passed. Worker tests: 23 passed.
- Database integration: 116 tests passed; API integration: 23 passed. Coverage
  includes cross-workspace planning references, optimistic concurrency,
  idempotency, persistence and lifecycle-field preservation.
- Release contract tests: 151 passed. Formatting, lint, API/web/database/client
  type checking, production builds and generated OpenAPI verification passed.
- Existing live browser journeys passed in Chromium and WebKit. The added
  two-account journey verifies invitation acceptance, assignment, project and
  sprint planning, milestone context, named discussion/reply persistence, draft
  recovery and guide accessibility. Its final run passed in both browsers after
  repairing mobile guide overflow.
- Task workflow regression suite: 11 passed. Compiled Cloudflare Worker
  navigation suite: 14 passed, including public-style and bundle-budget checks.
- Final release still requires all GitHub CI gates on the committed revision,
  publication verification and deployed service checks.

## Migration and release

Migration `0021_project_planning` adds a nullable JSONB `planning` column to
`boards`. Task planning uses the existing `work_items.type_data` JSONB column;
other task lifecycle data is preserved. Previous migrations are unchanged.

Back up the deployed database and rehearse restoring it plus the additive
migration before updating services. Apply the migration before deploying the new
API, worker and web release together. The predecessor can continue using the
database after this nullable-column addition; rollback should restore the
previous application cohort while retaining the column and existing data.

The release does not claim automatic recurring-task generation: recurring
calendar events remain available, and the guide explains that repeated tasks
must be created explicitly. Email invitation delivery reports the actual queued,
sent or failed state and depends on the configured mail provider.
