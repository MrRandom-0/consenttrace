# Deployment

**Purpose:** environment topology and runtime layout. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Database | embedded PG 17 (`npm run dev -w @consenttrace/database`) | managed Postgres (own instance) | managed Postgres (own instance, PITR) |
| Storage | local filesystem (`CT_STORAGE_DIR`) | S3-compatible bucket (staging) | S3-compatible bucket, versioned, signed URLs |
| Stripe | dev-mode plan switch | Stripe test mode | Stripe live + webhooks |
| Scan targets | fixtures allowed (`CT_ALLOW_FIXTURE_TARGETS`) | authorized domains only | authorized domains only |
| Workers | in-process runner | in-process or dedicated | dedicated worker containers |

Secrets are per-environment; nothing shared. `.env.example` documents every variable; required vars are validated at startup.

## Runtime layout

- **Web/API:** Next.js 16 (`next build` + `next start`). Security headers + CSP configured in `next.config.ts`.
- **Scan runner:** the queue-claim loop (`src/server/runner.ts`). Single-node installs run it in-process via Next instrumentation (`CT_DISABLE_RUNNER` opts out). Scaled deployments run the same loop in dedicated containers: egress-restricted network (SSRF defense in depth), memory/CPU limits, `npx playwright install chromium` baked into the image, hard per-scan timeout, temp cleanup. Concurrency scales by adding containers — `FOR UPDATE SKIP LOCKED` makes claims safe.
- **Fixtures:** dev/CI only; never deployed.

## Boot order (single node)

```bash
npm install && npx playwright install chromium
npm run dev -w @consenttrace/database        # or point DATABASE_URL at managed PG + run migrate
DATABASE_URL=… CT_STORAGE_DIR=… npm run build -w @consenttrace/web
DATABASE_URL=… CT_STORAGE_DIR=… npm run start -w @consenttrace/web
```

## CI gates (release requirement)

install → typecheck (root + extension + web) → unit suites → integration suite (real PG) → Playwright fixture E2E (incl. SSRF + regression) → production builds (web, extension zip). Migrations are review-required; deployment requires green CI.

## Observability hooks (Phase 3 wiring)

Structured logs exist (`[runner]`, `[api]` prefixes); metrics/error-monitoring exporters (queue depth, scan duration/failure rate, CMP detection rate, storage errors, webhook failures) attach next — client evidence never enters monitoring logs.
