# Data model

Every tenant-owned record is scoped by `organization_id` directly or by a guaranteed, indexed parent relation. UUID primary keys, created/updated timestamps, archive timestamps, and soft-delete timestamps are used consistently.

## Core records

- Organization, Portfolio, Portfolio membership, invitation, Hub membership
- Hub, Hub update, Hub metric, metric snapshot
- Board, board group, saved view, status
- Work item, item assignee, dependency, custom field/value, comment, mention, attachment, external resource
- Notification, activity event, audit log, integration connection, webhook delivery, outbox event
- Attention signal, waiting state, user-seen checkpoint, Hub snapshot, review ritual
- Decision outcome, Insight, Insight link
- Blueprint, Blueprint version, Blueprint instance
- Plan, subscription, entitlement, usage counter, billing event
- Stakeholder exposure, actionable Inbox item, import run/report

Hub health (`on_track`, `watch`, `critical`, `parked`) is manual management judgment. Attention signals are derived from due work, blockers, dependencies, waiting dates, ownership, update freshness, decisions, approvals, milestone evidence, and cross-Hub pressure.

Every existing Organization receives one default Portfolio during migration; all existing Hubs and Organization memberships are backfilled before `hubs.portfolio_id` becomes required. Existing `client_program` and `weighted_milestones` enum values remain compatibility aliases.

Work items use a common table with `item_type`. Decision, approval, and idea details are versioned validated JSON objects at first, while filter-critical state remains in indexed columns. Groups and statuses remain separate concepts.

## Deletion

Completion is workflow state, archive removes inactive records from normal views, soft deletion has a restore window, and audited permanent deletion is restricted to owners/admins.

## Search and indexes

PostgreSQL full-text search and trigram indexes cover accessible titles, descriptions, comments, updates, and resource metadata. Composite indexes begin with organization and the main filter dimension (Hub, board, status, assignee, due date). Portfolio aggregation is set-based to avoid per-Hub queries.
