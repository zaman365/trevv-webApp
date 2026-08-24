# FounderHQ product specification

FounderHQ is a portfolio-first operating system for a founder and the people working across multiple ventures, brands, products, client programs, shared functions, and private journeys.

## Product outcome

The Portfolio must answer, within 30 seconds: which Hub needs attention, why, what changed, what is blocked or overdue, what decision or approval needs the founder, the next milestone, and who owns the work. Automatic signals are calculated from the same work items used by boards; manual health is never silently inferred.

## Information hierarchy

The only hierarchy is Portfolio → Hub → Board → Work Item → optional subitem. Groups organize a board without adding a hierarchy level. Work items share one model and use the types task, decision, approval, milestone, idea, and request.

## V1 surfaces

- Web/PWA: complete product with authentication, onboarding, Portfolio, Hub overview, Table and Kanban boards, item detail, My Work, Inbox/Quick Capture, Decisions, Approvals, search, updates, templates, resources, notifications, settings, CSV import/export, and EN/DE foundations.
- API/worker: versioned Hono API, shared schemas and client, authorization, domain calculations, persistence repositories, event outbox, and scheduled-job foundations.
- Mobile: Expo shell that restores a session and reads Portfolio/Hubs through the shared client.
- Desktop: Tauri 2/Vite shell that restores a session and reads Portfolio/Hubs through the shared client.

## Product boundaries

V1 does not include accounting, invoicing, payroll, a full CRM, advanced Gantt, time tracking, chat, AI-required workflows, full offline collaboration, or feature parity across native clients. Optional providers degrade gracefully. Preview-only integrations are labeled honestly.

## Acceptance focus

The seeded FounderHQ Demo organization must provide a polished, useful evaluation path through Portfolio → Hub → Board → Item, with realistic decisions, approvals, blockers, milestones, updates, ownership, and accessible responsive behavior.

