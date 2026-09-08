# One workspace Dashboard — September 9, 2026

The user explicitly requested removal of the separate Overview surface. Workspace home (`/app/workspaces/:slug`) and `/dashboard` now render the same Dashboard. Navigation has one Dashboard entry and no Overview entry; existing workspace and board links retain their URLs and access checks.

The live Dashboard uses authorized saved work and boards to show:

- Open, overdue, blocked and completed work counts, with task-list drilldowns.
- A status distribution and completion ring, including a genuine empty state.
- Upcoming deadline bars for 7, 14 or 30 days, using the organization's current date.
- Project and cycle task progress, attention indicators and dated delivery targets.
- Open assignments per person, with blocked work highlighted and exact source-work filters.
- Upcoming open milestones linked to their original task records.

Project and personal scope filters apply across charts and the source task list. Status, owner, date and milestone filters preserve the existing inline status, version-conflict and task-opening workflows. Shared tasks count once in workspace totals and once for each assignee in workload. Charts show completion from current work states; they do not claim historical throughput, estimated capacity or a predictive health score. Partial record sets are explicitly labeled, and revoked board access hides retained dashboard data.

Plan creation, dated plans, task creation and assignment, all board links, operational follow-ups, decisions, approvals, waiting counts, worker status loading/error/retry, workspace update timestamps and the workspace's next milestone remain available. Demo Dashboard retains its existing reporting hierarchy, exports, chart lenses and signals. Its former Overview-specific summary editing, sample updates, milestone, resource, team and stakeholder controls are integrated under Workspace details, milestones and updates.

No database schema, authorization model or deployment plan was changed by this UI consolidation. Historical audit documents remain historical records. Current guide and accessibility references now identify Dashboard as the workspace home.

Validation covers aggregation, deduplication, shared assignments, date boundaries, cycle membership, chart drilldowns, preserved inline mutations, loading/error behavior, canonical routes, and a PostgreSQL-backed dashboard with 30 work items across three projects in Chrome and Safari at desktop and mobile sizes.

## Release dependency patches

The first CI run passed the production build and asset budgets, then found newly indexed dependency advisories. The release pins Next.js and its ESLint configuration to 16.3.3, upgrades vulnerable sharp instances to 0.35.4, and upgrades js-yaml 4.x instances to 4.3.2. The transitive overrides retain the existing major versions and the audit gate remains unchanged.

Maintainer references: [Next.js security release](https://github.com/vercel/next.js/releases/tag/v16.3.3), [sharp advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c), and [js-yaml advisory](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
