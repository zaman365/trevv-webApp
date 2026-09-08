# Persistent hosting proposal — September 8, 2026

Status: prepared, not applied. This requires explicit approval for recurring
spending. It does not change the existing disposable-preview documentation or
declare the product generally available.

Authenticated Render CLI inspection identified workspace `tea-daa36qpf2nfc73931ie0`
(Trevv Workspace, zaman.ase365@gmail.com). All four existing resources are Free.
The database expires September 29, 2026; the three services sleep after idle
periods and share the workspace's monthly Free instance-hour quota.

## Exact proposed changes

| Existing resource | ID                           | Proposed compute | Monthly compute |
| ----------------- | ---------------------------- | ---------------- | --------------: |
| API               | `srv-daa75k4s728c73fj8ah0`   | `0.5c-512mb`     |              $7 |
| Worker            | `srv-daa76h9srm7s73e5ka4g`   | `0.5c-512mb`     |              $7 |
| Alpha Web         | `srv-daa76u9srm7s73e5lbi0`   | `0.5c-512mb`     |              $7 |
| PostgreSQL        | `dpg-daa6n1cs728c73fhu6vg-a` | `0.1c-256mb`     |              $6 |

Total compute: $27/month, plus any separately billed database storage,
bandwidth, and taxes. Keep the database at its existing 1 GB allocation,
autoscaling off, and one instance per service. No new service, domain,
workspace subscription, or high-availability add-on is part of this proposal.

Prices were checked against [Render pricing](https://render.com/pricing).
The [compute plan documentation](https://render.com/docs/compute-plans) confirms
the plan IDs. Paid PostgreSQL on a Hobby workspace provides a three-day
[point-in-time recovery window](https://render.com/docs/postgresql-backups),
which begins accumulating after the upgrade. The existing database must be
upgraded in place; never delete or replace it to achieve this change.

## Execution and verification

1. Export the existing database and prove a restore in an isolated local
   database before changing its compute plan. Do not print credentials or
   customer data in logs.
2. Upgrade the existing database and verify availability, the unchanged data
   and migration journal, removed expiry, and enabled recovery capability.
3. Upgrade each existing service with `render services update <id> --plan
0.5c-512mb`, retaining its image, environment, URLs, health checks, and access
   rules. Verify readiness after each update.
4. Verify the complete matching application release, task persistence,
   assignment, collaboration, worker processing, and browser access on both
   domains. Remove temporary operator network access after database checks.

This removes Free-plan sleep and expiry. It is a small single-instance
deployment, without a high-availability guarantee. Recovery testing and the
existing production admission requirements remain separate obligations.
