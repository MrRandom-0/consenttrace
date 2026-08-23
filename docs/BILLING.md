# Billing & Entitlements

**Purpose:** monetization architecture. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Model

Plans are **data** (`apps/web/src/server/entitlements.ts`): Free / Pro $29 / Agency $89 / Scale (custom), each mapping to the spec §76 `Entitlements` shape (maxSites, maxMonthlyScans, scheduledScans, aiAnalysis, brandedReports, apiAccess, evidenceRetentionDays, maxMembers). The **backend is the source of truth**: site creation, scan enqueueing and schedule creation all enforce limits server-side; the UI merely renders `/api/me` values. Feature access is never hardcoded in components.

## Current state

**Implemented (`apps/web/src/server/stripe.ts`):**
- `POST /api/billing/checkout` (owner-only) creates a Stripe Checkout Session (subscription mode) via the REST API with `client_reference_id`/metadata carrying org + plan. Returns the hosted checkout URL. Without Stripe env keys it responds `BILLING_NOT_CONFIGURED` and the UI falls back to dev-mode switching.
- `POST /api/stripe/webhook` verifies the `Stripe-Signature` header manually (HMAC-SHA256 over `t.payload`, timing-safe compare, 5-minute tolerance) before parsing, then applies events **idempotently** via the `stripe_events` table: `checkout.session.completed` → plan + `subscription_status='active'` + customer/subscription ids; `customer.subscription.updated` → status mapping; `customer.subscription.deleted` → plan `free`, status `canceled`; `invoice.payment_failed` → `past_due`. All plan changes are audit-logged.
- Unit tests cover signature validity/tamper/replay/rotation; integration tests cover idempotent application and downgrade flows against real Postgres.
- Dev-mode owner-only endpoint (`POST /api/billing/plan`) remains for keyless evaluation; refused in production (`BILLING_LOCKED`).

**Required env (production):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, `APP_BASE_URL`. Point the Stripe webhook endpoint at `/api/stripe/webhook`.

**Remaining:** Customer Portal link, annual prices, read-only degradation window for `past_due` (status is tracked; enforcement policy pending), Scale-plan sales flow.

## Enforcement points (implemented)

- `POST /api/sites` → `maxSites`
- `POST /api/scans` + scheduled ticks → `maxMonthlyScans` (calendar-month count)
- `POST /api/schedules` → `scheduledScans`
- Evidence retention (`evidenceRetentionDays`) → enforced by the retention sweeper (Phase 3 with DATA_RETENTION.md)

Integration tests cover limit arithmetic and plan gates against real Postgres.
