# TREVV commercial delta

The commercial evolution is additive. Existing Organization, Hub, Board, and Work Item records remain valid; Decision, Approval, and Idea continue to use `work_items.item_type`.

## Delivered domain extensions

- Organization → Portfolio → Hub with deterministic migration/backfill
- generalized Hub types and honest progress modes for ongoing operations
- pricing-agnostic plans, subscriptions, entitlements, usage counters, and billing events
- deterministic Attention signals with reason, recommendation, rank, resolve, dismiss, and snooze
- Waiting states with internal/external classifications, expected dates, follow-up owners, and nudges
- per-user Change Radar checkpoints and meaningful-event filtering
- lightweight Hub snapshots created by optional review rituals
- immutable Decision outcomes and linked Insights/evidence
- opportunity fields and provenance from Idea to promoted execution
- managed Blueprint versions, update previews, selective application, overrides, and detach
- explicit stakeholder exposure, migration presets/dry runs, and cross-Hub pressure evidence
- actionable Inbox records separate from informational Notifications

## Compatibility

The migration creates one default Portfolio per existing Organization, copies membership scope, attaches every existing Hub, then makes the relation required. Pre-TREVV enum values and public client type aliases remain available for a compatibility window. No existing tenant data is deleted or rewritten into parallel Decision/Approval tables.
