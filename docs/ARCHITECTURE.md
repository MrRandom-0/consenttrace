# ConsentTrace Architecture

**Purpose:** define the end-to-end system design. **Scope:** all components, data flow, and the decisions behind them. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Components

1. **Chrome extension (WXT, Manifest V3)** — manual scans, side-panel inspection, evidence capture in the user's browser, upload to workspace. Never holds backend secrets.
2. **Web application (Next.js)** — auth, organizations, sites/environments, scan history, evidence viewer, diff UI, reports, schedules, team, billing.
3. **Automated browser worker (Node + Playwright)** — clean-browser consent tests. One isolated browser context per scenario; captures cookies, storage, requests, screenshots, consent interactions, timings; emits hashed evidence.
4. **Backend/API** — authn/authz, tenancy, scan queue, scheduling, evidence metadata, findings, reports, billing, AI orchestration, prompt registry, audit logs, notifications.

## Data flow (why evidence precedes AI)

```
Extension/Web → API → queue → Playwright worker → evidence (hashed, immutable)
→ deterministic rule engine → findings → optional AI explanation → reports/alerts
```

The recorder writes evidence **before** rules run; rules run **before** any AI. AI reads evidence and explains; it can never create, modify, or overrule evidence or deterministic rule outcomes. This ordering is the product's trust model: a customer must be able to delete every AI artifact and still have a complete, verifiable evidence package.

## Scan state machine

```
queued → running → completed
                 ↘ failed (structured failure code)
scenario: context_created → navigated → banner_detected? → action_performed?
        → settled → reloaded (persistence) → closed
```

Scenario-level outcomes: `completed`, `completed_with_observations` (e.g. `reject_action_not_found`), `failed`, `skipped`. Failure codes are enumerated in `packages/shared/src/failure-codes.ts`.

## Evidence pipeline

- Artifacts: screenshots (PNG), cookie/storage snapshots (JSON, values hashed), normalized network log, consent-action record, consent-UI snapshot, combined timeline, manifest.
- Each artifact: SHA-256 + size + created-at, registered in `manifest.json`; the manifest itself is hashed. Verification: `verifyManifest()`.
- Production storage: S3-compatible object storage, write-once keys (`scans/{scanId}/…`), short-lived signed URLs for reads, no public buckets.

## Rule engine & regression model

- `ConsentRule` objects with `evaluate(ctx)` — pure functions over evidence. Rule pack is versioned (`RULE_PACK_VERSION`).
- Baselines: explicit, never silently replaced (`baselines` table keeps history via `superseded_at`).
- Regression rules (CT-008/009/010) compare against a `BaselineSummary` derived from a stored scan; every regression finding links evidence IDs.

## Authentication & authorization

- Supabase Auth (or equivalent): email+password, OAuth, magic link. Sessions server-validated.
- Tenancy: every tenant table carries `organization_id`; RLS policies check membership. RBAC roles: owner, admin, analyst, viewer (`docs/AUTHORIZATION.md`).
- API keys per organization for API/CI trigger types; scoped + revocable.

## Queue

Abstraction (`enqueueScan`, `claimJob`, `completeJob`) with retries, dead-letter handling, idempotency keys (`scanId`), delayed jobs, schedules. First implementation: Postgres-backed (`FOR UPDATE SKIP LOCKED`), swappable for a dedicated broker later without touching callers.

## Worker isolation

Workers run in containers with: no tenant credentials, egress-restricted network (defense in depth beyond in-process SSRF checks), memory/CPU limits, hard per-scan timeout, temp-file cleanup, one scan per container process at a time.

## Object storage strategy

`scans/{orgId}/{scanId}/{scenario}/artifact` keys; per-organization prefix enables retention deletes; hashes stored in Postgres so integrity is checkable even after storage migration.

## Billing architecture

Stripe Checkout + Customer Portal + verified webhooks → `organizations.plan` → server-side `Entitlements` resolver (single module) consulted by API and UI. The frontend never asserts plan state.

## AI architecture (summary)

Deterministic first; AI as fallback and explainer, behind data minimization, prompt versioning, invocation logs and a safety validator for any element interaction. Details: `docs/AI_ARCHITECTURE.md`.

## Deployment

Dev (local Docker Postgres + fixtures) → Staging (separate DB/storage, Stripe test) → Production (separate secrets, worker pool). One database per environment, no exceptions. CI gates: typecheck, lint, unit, component, integration, scanner fixtures, SSRF + prompt-injection tests, builds.

## Phase 1 implementation order (current)

1. ✅ Monorepo + shared types + SSRF validation
2. ✅ Scanner core (CMP detection data, action classifier, diffs)
3. ✅ Rule engine CT-001…CT-010 + knowledge bases
4. ✅ Evidence recorder + manifest hashing
5. ✅ Fixture sites + Playwright worker + CLI + reports (tested E2E)
6. ✅ Database migration 0001
7. 🔜 Web app: auth → orgs → sites → scan trigger → scan detail/evidence viewer
8. 🔜 Queue + worker service wrapper (API-driven scans)
9. 🔜 Extension: side panel, quick check, evidence upload

## Failure modes

Worker crash → job retry with bounded attempts, then dead-letter + `scan_failed` notification. Storage write failure → `EVIDENCE_UPLOAD_FAILED`, scan marked failed (evidence completeness is a hard requirement). Rule engine exception → per-rule `error` result, never a silent pass.

## Future considerations

Multi-region scan profiles, IndexedDB observation, Consent Mode analyzer (Phase 2), CMP iframe/shadow-DOM traversal breadth, PSL-based registrable-domain resolution.
