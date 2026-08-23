# API

**Purpose:** HTTP surface of the web application. **Scope:** `apps/web/src/app/api`. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

All endpoints return JSON with structured errors `{ error: { code, message } }`. Cookie-session auth (httpOnly, SameSite=Lax); mutations enforce an Origin-matches-Host CSRF check; auth endpoints are rate-limited. Organization scoping is applied server-side on every query. Public API-key access (`/v1`, OpenAPI, idempotency keys, pagination cursors) ships in Phase 3 on top of these handlers.

| Method & path | Auth | Role | Purpose |
| --- | --- | --- | --- |
| POST `/api/auth/register` | — | — | Create user + workspace (owner), start session |
| POST `/api/auth/login` · `/api/auth/logout` | —/session | — | Session lifecycle |
| GET `/api/me` | session | viewer | User, org, role, entitlements, usage, plan catalog |
| GET/POST `/api/sites` | session | viewer/admin | List sites with latest-scan summary; create site (**requires authorization confirmation**, plan limit enforced) |
| GET/DELETE `/api/sites/:id` | session | viewer/admin | Site detail (scans, active baseline, schedules, open findings); archive |
| GET/POST `/api/scans` | session | viewer/analyst | List scans; enqueue scan (authorization + monthly quota enforced) |
| GET `/api/scans/:id?include=result` | session | viewer | Scan row (+ full deterministic `ScanResult` JSON) |
| POST `/api/scans/:id/baseline` | session | admin | Pin as baseline (previous baseline superseded, never deleted) |
| GET `/api/scans/:id/artifacts/*path` | session | viewer | Stream evidence artifact after org authz (path-traversal-guarded; production swaps to signed URLs) |
| GET/POST `/api/schedules`, PATCH/DELETE `/api/schedules/:id` | session | viewer/admin | Scheduled scans (Pro+ entitlement; cron subset `M H * * *` / `M H * * D`) |
| GET `/api/team` | session | viewer | Members + roles |
| GET `/api/audit` | session | viewer | Workspace audit trail |
| POST `/api/billing/plan` | session | owner | **Dev-mode only** plan switch; production plans change via Stripe webhooks exclusively |

Failure codes reuse `packages/shared/src/failure-codes.ts` plus API-specific: `UNAUTHENTICATED`, `FORBIDDEN`, `BAD_ORIGIN`, `RATE_LIMITED`, `PLAN_LIMIT`, `VALIDATION`, `NOT_FOUND`, `EMAIL_TAKEN`, `BAD_CREDENTIALS`, `DOMAIN_NOT_AUTHORIZED`, `BILLING_LOCKED`.

## Future
`/v1` public API with org API keys, webhooks-out, CI endpoint parity with the CLI, OpenAPI document, cursor pagination.
