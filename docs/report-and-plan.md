# Report & Log

Workspace navigation includes **Report & Log** after Calendar. The main route is
`/app/workspaces/:workspaceSlug/report-log`. The previous `report-plan` route
continues to open the same experience. Existing My Work, project/sprint
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

Filters cover report/log/plan, member, visibility, overlapping dates and needs
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

## Work logs, working time and results

Report & Log is available in workspace navigation, Dashboard, My Work, Sprints,
Teams and weekly-review related sections. Embedded views use the selected
workspace. The top tabs organize All updates, Reports, Work logs, Plans and
Templates. Existing plan creation, reuse for the next period, weekly-review
navigation, member/date/visibility filters, copying, editing and archiving remain.

A work log records activities, completed work, results and impact, progress,
blockers, support and next steps. Reports and plans can also include optional
working time and resource links. The editor groups these into Update, Working
time, and Links & resources. Reported progress is optional and self-reported; it
does not silently change task completion.

Time entries contain an activity and date. Enter a net working duration in
minutes, or use local clock start/end times, breaks, and an explicit next-day
ending. Breaks are subtracted from working time. Overnight shifts require the
report period to include both dates. Validation rejects nonpositive or
inconsistent durations, periods outside the report, overlapping clock intervals
within an update, and more than 24 hours of work attributed to one start date.
No background timer, employee monitoring, billing or payroll inference is added.
Cross-report overlap is not inferred: these are independently authored records.

Resource links have a name, an HTTP(S) URL and an optional note. All report,
log and plan types support them, including Google Drive, Google Docs, designs,
external files and results. Links open at their source; source permissions remain
unchanged. URLs with embedded credentials or executable schemes are rejected.
Files are not imported or uploaded by this workflow.

The templates cover Daily progress, Weekly report, Sprint review, Results &
handover, Daily work log, Weekly time log and Next-period plan. Templates supply
period defaults and writing prompts; they never claim work was completed. Authors
can use a saved update as a reusable template. This keeps context, goals, next
steps and resources while clearing actual time, completed work, results, blockers
and progress. Existing plans still support their original next-period action.
Changing the template prompt in an editor preserves its current text and dates.

Cards show logged time, progress and resource counts. Read full update exposes
all details and resource links. Copy text includes results, time and URLs. Export
time downloads a CSV for entries on the current filtered page (not a total for
unloaded pages); cells are quoted and spreadsheet formulas are neutralized.

## Compatibility and rollout

API URLs, table name, IDs and author/version/privacy rules remain compatible.
The `log` kind extends the two original `report` and `plan` kinds. Optional JSON
content fields carry results, progress, template choice, resource links and time
entries; old records without those fields continue to load.

Migration `0026_youthful_lake.sql` extends the existing kind check to permit logs.
It does not delete or rewrite any record. Deploy the updated API contract and
apply the migration before deploying the UI to live accounts. Local integration
checks exercise migration, persistence, draft privacy, publishing, author-only
editing, version conflicts and archive behavior. Demo storage remains separate.
