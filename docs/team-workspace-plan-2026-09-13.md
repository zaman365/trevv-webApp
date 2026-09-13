# Team workspace functionality plan

## Purpose

Give every team a complete, addressable place to coordinate its people,
communication and delivery. The first screen should answer what this team does,
who owns it, what needs attention, and what to do next. Implement the following
plan using the application's existing saved records and permission rules.

## Navigation and layout

- Add `/app/workspaces/:workspaceSlug/teams/:teamId` with workspace access checks,
  a breadcrumb back to the directory, the team name and purpose, department,
  lead, member count and clear actions for creating work and opening the room.
- Use a full-width page inside the existing workspace shell. Keep navigation
  visible and use spacious content panels with responsive stacking on mobile.
- Provide addressable Overview, Tasks, Projects & milestones, Communication,
  People & workload, and Settings sections. Browser Back, Forward, refresh and
  copied section links must work.
- Team names and an explicit Open team action in the directory lead to the new
  page. Preserve the summary-card details, quick Manage drawer, invitations,
  workload controls, room links, demo directory and all existing routes.

## Functional sections

| Section               | Information and actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview              | Purpose, lead and members; open/completed/overdue/blocked work and active projects; clickable metrics; upcoming milestones and deadlines; priority work; per-person workload; recent work updates with links to the actual records. Clear empty and loading states.                                                                                                                                                                                                                    |
| Tasks                 | Team-owned work and the established fallback for members' unassigned-team work, without pulling explicitly owned work from other teams. Search, list/board mode, owner, status, priority, topic, category, date and completion filters. Create work with this team preselected, update status, open complete task details, edit assignment/dates/planning, post updates and evidence, and handle conflicts. Retain tasks, decisions, approvals and milestones as supported work types. |
| Projects & milestones | Team-specific project plans, goals, dates, department templates and progress; create/edit plans, sprints/campaigns and milestone records; see upcoming milestones and open the underlying project and tasks. Use existing planning and concurrency controls.                                                                                                                                                                                                                           |
| Communication         | General team-room conversation with sender/time, replies, older messages, recoverable drafts and confirmed sends; separate named topics using the existing discussion workflow; open the full Messages experience for its additional room, reaction and response-management tools. Member-specific direct-conversation actions reuse existing private conversations or create them on request. No message is sent merely by opening the page.                                          |
| People & workload     | Full member directory with names, contact details, roles, open/overdue/blocked counts, view-person-work and direct-message actions. Reuse existing add-member, role change, removal, invitation acceptance/delivery and refresh controls in the page. Clearly distinguish managing existing members from inviting new organization members.                                                                                                                                            |
| Settings              | Existing team profile, purpose, department preset and tool configuration, using the same version-conflict handling and permission checks as quick management. Keep unsaved edits when moving between page sections.                                                                                                                                                                                                                                                                    |

## Data and behavior guarantees

- Counts and lists come from the same team scope. Explicit task/project team
  ownership wins over a person's membership in multiple teams. Completion and
  deadlines use saved records and the workspace timezone.
- Team creation, membership and profile edits share the existing mutation
  handling. Confirmed changes update the page and directory caches together.
- Creation from a team has its own recoverable draft scope and preselected team;
  it must not overwrite a workspace capture draft or silently assign work to a
  different team. Existing general capture and Inbox behavior stay intact.
- Private rooms remain private. Viewer/guest/member/lead/admin permissions stay
  enforced by the existing APIs; tool presets never grant access. Loading and
  transient failures must not masquerade as empty successful data. Access loss
  removes affected content and actions, including already-open details.
- All buttons have real actions, links have real destinations, and feedback
  reflects confirmed outcomes. No invented online presence, activity, capacity
  percentages, file library, meeting service or unsupported automation.
- No schema migration is required for these capabilities. The full Messages
  experience and current project/board pages remain available for deeper work.

## Implementation sequence

1. Add the Team route, navigation helpers and shared team management content.
2. Build the page shell and overview from team-scoped records.
3. Connect task creation/details/status changes and project/milestone planning.
4. Add communication and people/workload actions with draft/access handling.
5. Connect directory and summary entry points, document usage, and verify.

## Acceptance and validation

- Open a team from the directory, copy/reload a section URL, navigate sections
  and return to the directory without losing the existing summary interactions.
- With multiple teams and overlapping membership, verify scoped task counts,
  workload and plans, completed work and overdue drilldowns.
- Create a team task and milestone, save the team/project context, open details,
  change assignment/status and preserve unsaved drafts and conflict recovery.
- Create/edit a team project and delivery cycle, preserving planning references.
- Send a test message, reply, create/reply to a named topic, reopen drafts and
  verify direct-conversation reuse using isolated fixture accounts only.
- Add/change/remove a test member and edit the profile using current versions;
  verify read-only roles, unavailable rooms and revoked team access.
- Exercise desktop and narrow screens in light/dark themes, keyboard operation,
  focus recovery and accessibility checks. Run relevant unit, route, browser,
  type and lint checks, plus existing workflow regressions.

## Delivery record

Implemented all six sections in `LiveTeamPage`, backed by the existing work,
project, membership and conversation APIs. Added the guarded Team route and
directory/summary entry points. Quick management now shares its content and
mutation handling with the full page, retaining its original tabs and actions.
The usage guide documents the new page alongside the existing workflows.

Validation completed on 2026-09-13:

- All 365 Web unit tests passed, including route access, demo compatibility,
  team ownership and navigation coverage.
- All 28 relevant Chromium browser tests passed: 17 preserved directory,
  summary, dashboard and task workflows, plus 11 Team-page scenarios.
- All 11 Team-page scenarios passed on WebKit, including creation, project
  editing, conversations, membership, private access and section navigation.
- All six sections passed overflow and automated WCAG accessibility checks at
  desktop and mobile widths in light and dark themes. Reviewed desktop/light
  and mobile/dark screenshots. Creation-form footers stay visible on mobile;
  keyboard focus is trapped and restored to the opening action.
- Web lint, TypeScript and the production Next.js build passed. The build used
  explicit live-mode validation settings and HTTPS test origins.
- Browser writes were exercised against isolated fixture APIs, including
  version-checked edits, failed-message retries with the same idempotency key,
  recoverable drafts, direct-conversation reuse/creation, and access revocation.

The implementation is local and uncommitted; deployment remains a separate
operation. Existing directory summary interactions and other worktree changes
were preserved.
