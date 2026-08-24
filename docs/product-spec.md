# TREVV product specification

TREVV is a commercial, portfolio-first operating system for people responsible for multiple businesses, brands, clients, products, departments, ventures, initiatives, investments, campaigns, programs, projects, and shared functions.

## Product outcome

Within 30 seconds, TREVV must answer: what is healthy, what changed, what is slipping, what is waiting, what needs a decision, and where the current user should focus. Signals are deterministic and explain their evidence; manual health is never silently changed.

## Information hierarchy

The hierarchy is Organization → Portfolio → Hub → Board → Work Item → optional subitem. Groups organize a board without adding a hierarchy level. Work items share one model and use the types task, decision, approval, milestone, idea, and request.

## V1 surfaces

- Web/PWA: authentication, archetype-neutral onboarding, personalized Home, multi-Portfolio, Attention, Waiting, Change Radar, reviews/snapshots, Hub overview, Table and Kanban boards, My Work, actionable Inbox, Decisions, Approvals, Ideas/Insights, Blueprints, stakeholder sharing, import/export, and EN/DE foundations.
- API/worker: versioned Hono API, shared schemas and client, authorization, domain calculations, persistence repositories, event outbox, and scheduled-job foundations.
- Mobile: Expo shell that restores a session and reads Portfolio/Hubs through the shared client.
- Desktop: Tauri 2/Vite shell that restores a session and reads Portfolio/Hubs through the shared client.

## Product boundaries

V1 does not include accounting, invoicing, payroll, a full CRM, advanced Gantt, time tracking, chat, AI-required workflows, full offline collaboration, or feature parity across native clients. Optional providers degrade gracefully. Preview-only integrations are labeled honestly.

## Acceptance focus

The seeded TREVV Demo organization uses fictional names and exercises at least one On Track, Attention, Critical, and Paused Hub; a stale update; unresolved decision; waiting state; blocker; overdue milestone; Attention signal; Decision outcome; and Insight linked to an Idea.
