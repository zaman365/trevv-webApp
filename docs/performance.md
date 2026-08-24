# Performance evidence

Evidence captured on 2026-08-24 from the local release candidate on Apple Silicon. These numbers are directional engineering evidence, not production SLO measurements.

## API smoke measurements

The Hono service was already warm and served the seeded deterministic dataset.

| Request                 | Status |           Payload | Observed response time |
| ----------------------- | -----: | ----------------: | ---------------------: |
| `GET /api/v1/health`    |    200 |   health envelope |                 7.6 ms |
| `GET /api/v1/portfolio` |    200 |   6.62 kB; 9 Hubs |                 1.8 ms |
| `GET /openapi.json`     |    200 | 5.20 kB; 11 paths |                 1.4 ms |

The portfolio response is a single aggregate read, avoiding client-side N+1 calls. Persistence indexes cover workspace, Hub, item, status, assignee, due-date, activity, notification, outbox, and idempotency lookup paths.

## Build evidence

- Next.js compiled the Web/PWA with its Webpack production compiler in 1.93 seconds and emitted all public, authentication, portfolio, Hub, work, search, and operations routes.
- The desktop renderer emitted 307.95 kB JavaScript raw / 93.35 kB gzip and 5.97 kB CSS raw / 1.62 kB gzip.
- All 18 Turborepo package/application build tasks completed successfully.

## Release interpretation

The V1 implementation has no measured client-side N+1 dependency and keeps the desktop shell comfortably below a 100 kB gzip JavaScript budget. A production deployment must still collect Core Web Vitals, cold-start latency, database query plans, and large-workspace traces before claiming the brief's sub-two-second portfolio SLO. The first production performance gate should include Lighthouse on representative mobile hardware and `EXPLAIN ANALYZE` evidence for the portfolio roll-up at 100+ Hubs and 10,000+ items.
