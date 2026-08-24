# Deployment

## Recommended EU topology

- Web/PWA: a Node-compatible Next.js host in an EU region
- API and Worker: separate long-running Node 22 services in the same private EU network
- Database: managed PostgreSQL 17 with point-in-time recovery and encrypted connections
- Files: private S3-compatible EU bucket with signed downloads and lifecycle rules
- Observability: EU-project Sentry/log destination with payload redaction

Web, Mobile, and Desktop point to one public HTTPS API. The API is the only service with database credentials. The Worker shares database and queue/outbox bindings but is not internet-facing.

## Build commands

| Service | Build                                    | Start                                          |
| ------- | ---------------------------------------- | ---------------------------------------------- |
| Web     | `pnpm --filter @founderhq/web build`     | `pnpm --filter @founderhq/web start`           |
| API     | `pnpm --filter @founderhq/api build`     | `node apps/api/dist/index.js`                  |
| Worker  | `pnpm --filter @founderhq/worker build`  | `node apps/worker/dist/index.js`               |
| Mobile  | `pnpm --filter @founderhq/mobile build`  | EAS/native pipeline                            |
| Desktop | `pnpm --filter @founderhq/desktop build` | `pnpm --filter @founderhq/desktop tauri build` |

Run `pnpm install --frozen-lockfile`, `pnpm contracts:generate`, and all quality gates before producing artifacts. Apply `pnpm db:migrate` as a one-off release job before API rollout, then run `pnpm db:seed` only for a new demo/pilot database.

The root `pnpm build` validates every workspace through Turborepo. A Sites environment that deliberately launches the root script through npm compiles the same Web/PWA through the official Vinext/Cloudflare adapter and stages its Worker artifact at the repository root. This deployment-only target does not change the normal Next.js development or production build.

## Release order

1. Snapshot/verify PostgreSQL and validate backup restore recency.
2. Run migrations with a dedicated migration identity.
3. Deploy API; verify `/api/v1/health`, auth cookie policy, and one permission-scoped request.
4. Deploy Worker and confirm outbox lease/attempt metrics.
5. Deploy Web with `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL` set to public HTTPS URLs.
6. Run Web smoke, Playwright, axe, export, and rollback tests.
7. Point Expo/Tauri builds at the same API only after API compatibility is confirmed.

Use rolling API/Worker deploys. Database changes must be backwards-compatible for one release. Roll Web back independently; never roll database state back by applying destructive SQL. Create a forward fix instead.

## Required production variables

Use `.env.example` as the catalog. Secrets belong in the provider secret manager. Public client variables may contain URLs/IDs only. Set `DEMO_MODE=false`; do not expose database or integration credentials to Next.js, Expo, or Vite bundles.

## Deep links

Web uses HTTPS application routes on the configured host; `trevv.de` is the primary product domain. Mobile registers `trevv://`; desktop registers the Tauri deep-link capability when packaging is enabled. Auth callbacks must include a one-time state/PKCE verifier and return to a specific safe route. Unknown deep links open Home, never arbitrary external URLs. The legacy scheme may be accepted temporarily for compatibility.
