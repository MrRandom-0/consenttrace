# Authorization & RBAC

**Purpose:** identity, tenancy and permission model. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Identity modes

- **Self-hosted (implemented):** email + password (scrypt N=16384/r=8/p=1, per-user salt), DB sessions storing only sha256(token), 30-day expiry, httpOnly SameSite=Lax cookies (Secure in production), rate-limited auth endpoints, Origin-check CSRF on mutations.
- **Managed (deployment option):** Supabase Auth issues identities; `users.password_hash` stays null and Supabase user ids map to `users.id`. RLS policies then mirror the API-side predicates below.

## Tenancy

Every tenant table carries `organization_id`. The API resolves the caller's membership once per request and scopes **every** query by `organization_id` — object ids alone never grant access (IDOR defense). Evidence artifact reads re-check scan ownership before streaming; object keys are scan-scoped and path-traversal-guarded.

## Roles

| Capability | owner | admin | analyst | viewer |
| --- | :-: | :-: | :-: | :-: |
| View sites/scans/evidence/reports | ✓ | ✓ | ✓ | ✓ |
| Run scans | ✓ | ✓ | ✓ | — |
| Create/archive sites, set baselines, manage schedules | ✓ | ✓ | — | — |
| Manage team | ✓ | ✓ | — | — |
| Billing / plan changes | ✓ | — | — | — |

Enforced by `requireRole` (rank-ordered) in every mutating route. Billing is owner-only per spec §73.

## Domain authorization (scan targets)

Site creation requires an explicit authorization confirmation, stored as `authorized_confirmed_at`; `createScan` refuses environments without it (`DOMAIN_NOT_AUTHORIZED`). Domain **verification** (DNS TXT / meta / file) gates higher scan volume — schema fields exist (`verification_method`, `verified_at`, `verified_by`); the verification checker ships next. Per-tenant quotas (entitlements) bound total scan volume.

## Session hygiene

Logout deletes the session row; expiry enforced in SQL (`expires_at > now()`); tokens are 256-bit random, never persisted raw (integration-tested).
