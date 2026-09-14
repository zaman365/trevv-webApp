# Task pages and review lifecycle

Task cards open `/app/workspaces/:workspaceSlug/tasks/:itemId`. Existing board links ending in a task ID redirect to the same page. The task has four sections: Overview, Reviews, Activity & evidence, and Edit & actions. Assignment, planning, status changes, blocking/unblocking, evidence, updates, waiting/follow-ups, completion with evidence and reopening remain available. Editors are explicitly opened rather than appearing on every card.

## Review workflow

1. Open a task and select **Send for review**. Choose up to 25 workspace members, add review instructions and resource URLs in the notes, and optionally set a review due date.
2. The task moves to **In review**. Reviewers find it in **Reviews for me**, also available from My Work. Each assigned person can approve or request changes with a note. Responses are recorded against that particular round.
3. Every reviewer must approve before the task can be completed. Changes requested return it to In progress. Further feedback can still be recorded until a new round replaces the previous one.
4. Resubmitting creates a new round, resetting every reviewer's decision. Previous requests, notes and responses remain in activity/history. Editing the title, description or planning, or reopening completed work, invalidates an existing review so changed work cannot reuse an old approval.
5. Completion still requires evidence. Tasks without a review request can use the existing completion flow. The requester, task owner or a workspace manager may explicitly cancel a pending/invalidated review with a recorded explanation, permitting completion without that review.

Reviews supports **Reviews for me**, **Requested by me**, **All task reviews**, and the existing **Weekly review** with its workspace reports and snapshots. Assignment to a review is an in-app queue action; this feature does not send external email or chat messages.

## Persistence and API

`POST /api/v1/items/:id/review` accepts a strict `request`, `respond` or `cancel` command. It requires `If-Match` and a UUID `Idempotency-Key` and returns the updated task with a strong ETag and idempotency receipt. A response is accepted only from a reviewer assigned to the current round. Reviewers must retain access to the task's workspace; cross-organization references are rejected.

The current typed review is stored alongside existing planning/lifecycle data in `work_items.type_data.review`. Each operation increments the task's version atomically and writes the review snapshot to the existing work-item history, audit and outbox transaction. Earlier rounds are reconstructed from those history snapshots, rather than accumulating an unbounded list on each task read. Existing tables already support this representation, so this change needs no schema migration. Generic item updates and the resolve endpoint enforce the same review completion checks.

Targeted regression coverage: `packages/core/src/task-review.test.ts`, `apps/api/src/task-review.test.ts`, the `task review persistence` database test, and `tests/performance/task-page.spec.ts` (card navigation, grouped editors, multiple reviewers, retry key reuse, review queue, weekly review preservation and mobile layout).
