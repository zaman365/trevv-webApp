# Task workflow repairs — 2026-09-07

These changes address failures in the live task workflow used by both
`trevv.de` and `alpha.trevv.de`. They are local source changes until deployed.
Existing demo surfaces, Inbox tabs, work types, evidence requirements,
permission checks, version conflicts, and recoverable capture drafts remain
available.

## Corrected behavior

| Failure                                                                                                              | Repair                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access checks were aborted after one second, producing failures on slower responses.                                 | Allow the existing bounded 4.5-second access-check budget. The five-second polling cadence, identity checks, revocation handling, and outage reporting remain intact.                     |
| Initial loading could display stale data dated January 1, 1970.                                                      | An uninitialized snapshot does not start the stale timer or display a fabricated sync timestamp. Real request errors still appear.                                                        |
| A transient board metadata refresh failure replaced the board and discarded the open task form.                      | Keep cached board content and drafts during transient failures, with an explicit retry. Permission loss still removes the content immediately.                                            |
| A background read error could claim an earlier write was not saved.                                                  | Distinguish failed refresh messages from unconfirmed mutation messages.                                                                                                                   |
| Task creation had no assignee field; the detail picker used an administrator-only organization directory.            | Creation and details share an assignee field backed by the existing authorized workspace directory, with loading and retry feedback. Unassigned creation remains available.               |
| Direct capture sent an unassigned task to My Work, where it was absent.                                              | The confirmation opens the actual board item. Board creation opens the new task's details.                                                                                                |
| Successful creation waited for unrelated refreshes, and Inbox captures stayed missing on an already-open Inbox page. | Publish acknowledged server records into the existing cache immediately, cancel obsolete reads, and reconcile in the background. Keep safe retry keys after unconfirmed requests.         |
| Inbox conversion discarded assignment and left users with an identifier instead of a next action.                    | Carry the captured assignee through conversion and link to the resulting board item. Live Inbox initially selects Captured work; Sample Email and Workspace Actionable remain accessible. |
| A closed deep-linked task drawer reopened after data changed.                                                        | Consume each hash navigation once and handle subsequent hash changes explicitly. Task-specific forms are keyed by item identity.                                                          |
| Progress updates required leaving the task details.                                                                  | Add status progression in details, preserving the existing blocked-state handling and evidence-backed completion operation.                                                               |

## Verification

Final local results: 313 web unit tests, 17 browser regression tests, and all
three PostgreSQL-backed founder-loop scenarios passed. The live tests built
and ran the production Web bundle. TypeScript checking, lint for changed
files, formatting, and `git diff --check` also passed.

- Browser regression coverage in `tests/performance/live-workflow.spec.ts`
  exercises creation, assignment, progress, completion, Inbox conversion,
  delayed post-save reads, retries, drawer stability, transient errors, and
  permission revocation using the actual components and typed API client.
- `tests/performance/responsiveness.spec.ts` covers a first access check longer
  than one second, unchanged polling, account changes, outages, permission
  loss, and preservation of drafts during navigation and refresh.
- Unit coverage includes Inbox version ordering, duplicate acknowledgements,
  cold-cache completeness, account isolation, and read-error wording.
- The existing PostgreSQL-backed founder-loop tests verify persistence,
  evidence, Waiting, review history, multiple accounts, conflicts, injected
  faults, and the Portfolio-to-Task creation hierarchy. They run against a
  separate disposable local database, not deployed accounts.

## Deployed runtime finding

At inspection, alpha displayed queued background events and a last-processed
timestamp from the previous day. The worker's public readiness endpoint did
not respond within 45 seconds on the first request. A subsequent request
returned ready: the worker reported a successful sweep at
`2026-09-07T18:30:10.730Z`, zero ready events, eight delayed events, and no
failed or dead-lettered deliveries. This is consistent with a sleeping free
service waking; delayed events alone are not evidence of failed processing.

The GitHub keep-warm workflow was configured for every ten minutes, but its
five latest recorded start times were `2026-09-07T17:53:01Z`,
`2026-09-07T12:33:37Z`, `2026-09-07T06:10:06Z`,
`2026-09-07T01:19:28Z`, and `2026-09-06T23:49:22Z`.
Those gaps do not keep a service awake through a fifteen-minute idle limit.
The source repairs do not provide an always-running worker or a reliable
external wake-up schedule. No hosting plan, production setting, or deployed
code was changed during this repair.
