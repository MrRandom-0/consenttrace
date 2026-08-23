# API

**Purpose:** HTTP surface of the web application — session-authed dashboard endpoints and the public key-authed `/v1` API. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

All endpoints return JSON with structured errors `{ error: { code, message } }`.

## Public API — `/api/v1` (implemented)

### Authentication

Org-scoped API keys, created in **Settings → API keys** (requires the `apiAccess` entitlement — Agency plan and above; enforcement re-checks the plan on every request, so downgrades disable existing keys). Tokens look like `ct_live_<40 hex>`, are shown **exactly once** at creation, and are stored as sha256 only. Keys carry a scope: `read` (GETs) or `write` (also trigger scans, create sites, pin baselines) and are revocable at any time.

```
Authorization: Bearer ct_live_…
```

Rate limit: 120 requests/minute/key (`429 RATE_LIMITED`). Failure codes: `UNAUTHENTICATED`, `KEY_REVOKED`, `SCOPE`, `PLAN_LIMIT`, `VERIFICATION_REQUIRED`, `INVALID_CURSOR`, `VALIDATION`, `NOT_FOUND`.

### Endpoints

| Method & path | Scope | Purpose |
| --- | --- | --- |
| GET `/api/v1/sites` | read | List sites (id, url, verified, `environment_id`) |
| POST `/api/v1/sites` | write | Create a site — requires `"authorized": true` (same testing-authorization obligation as the dashboard) |
| POST `/api/v1/scans` | write | Enqueue a scan for `siteEnvironmentId` (or `siteId` → its Production environment). Honors the **`Idempotency-Key`** header: retries with the same key return the original scan (`idempotentReplay: true`). Entitlement quota + unverified-site cap enforced |
| GET `/api/v1/scans?siteId&limit&cursor` | read | List scans, **keyset pagination**: `pagination.nextCursor` (opaque; microsecond-safe) |
| GET `/api/v1/scans/:id[?include=result]` | read | Scan status/summary; `include=result` embeds the full deterministic `ScanResult` JSON |
| GET `/api/v1/scans/:id/findings` | read | Rule findings, severity-ordered |
| GET `/api/v1/scans/:id/evidence` | read | Evidence index: artifact paths, types, SHA-256 hashes, sizes |
| GET `/api/v1/scans/:id/report` | read | Streams the self-contained HTML evidence report |
| POST `/api/v1/baselines` | write | Pin a completed scan as the environment baseline (previous baseline superseded, never deleted) |

### CI usage

```bash
# One-shot: trigger a cloud scan, wait, fail the build on HIGH findings.
CONSENTTRACE_API_KEY=ct_live_… npm run scan:cloud -- \
  --base-url https://app.yourdeployment.com \
  --site "Northwind Outfitters" \
  --fail-on high --idempotency-key "$GITHUB_SHA"
```

Exit codes: `0` clean · `1` scan failed/timeout · `2` deterministic findings at/above `--fail-on` · `64` usage. Only deterministic rule results drive exit codes (spec §71).

Raw curl:

```bash
curl -s -X POST "$BASE/api/v1/scans" \
  -H "Authorization: Bearer $KEY" -H "Idempotency-Key: deploy-123" \
  -H "content-type: application/json" \
  -d '{"siteId":"<uuid>","scenarios":["no_action","reject_all","accept_all"]}'
```

Coverage: 10 integration tests drive the real route handlers against real Postgres (key hashing, plan gating, scope enforcement, revocation, idempotent replay, cursor pagination incl. malformed-cursor rejection, baseline pinning).

## Dashboard API — session-authed

Cookie sessions (httpOnly, SameSite=Lax); mutations enforce an Origin-matches-Host CSRF check; auth endpoints are rate-limited; organization scoping is applied server-side on every query.

| Method & path | Role | Purpose |
| --- | --- | --- |
| POST `/api/auth/register` · `/api/auth/login` · `/api/auth/logout` | — | Account + session lifecycle |
| GET `/api/me` | viewer | User, org, role, entitlements, usage, billing state, plan catalog |
| GET/POST `/api/sites`, GET/DELETE `/api/sites/:id` | viewer/admin | Sites (creation requires authorization confirmation; plan limits) |
| POST `/api/sites/:id/verify` | admin | Domain verification (DNS TXT / meta / well-known file) |
| GET/POST `/api/scans`, GET `/api/scans/:id?include=result` | viewer/analyst | Scan list/trigger/detail |
| POST `/api/scans/:id/baseline` | admin | Pin baseline |
| GET `/api/scans/:id/artifacts/*path` | viewer | Stream evidence artifacts (authz + traversal-guarded) |
| GET/POST `/api/schedules`, PATCH/DELETE `/api/schedules/:id` | viewer/admin | Scheduled scans (Pro+) |
| GET/POST `/api/apikeys`, DELETE `/api/apikeys/:id` | viewer/admin | API key management (create shows token once) |
| GET `/api/team` · GET `/api/audit` | viewer | Members, audit trail |
| POST `/api/billing/checkout` | owner | Stripe Checkout session (`BILLING_NOT_CONFIGURED` without keys) |
| POST `/api/billing/plan` | owner | Dev-mode plan switch (refused in production) |
| POST `/api/stripe/webhook` | — (Stripe) | HMAC-verified, idempotent plan updates — the only production plan write path |

## Future

OpenAPI 3.1 document generation, webhook-out subscriptions (scan.completed, finding.regression) with signed payloads, per-key IP allowlists, shared-store rate limiting for multi-instance deployments.
