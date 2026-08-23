# Changelog

## [Unreleased] — 2026-08-23 (public /v1 API)

### Added
- **Org API keys**: `ct_live_` tokens shown once and stored sha256-only, read/write scopes, revocation, last-used tracking, `apiAccess` entitlement enforced at creation AND on every request (plan downgrades disable keys); Settings UI card with one-time token reveal; `api_key_created`/`api_key_revoked` audit events. Migration `0004` (api_keys, idempotency_keys).
- **`/api/v1` endpoints**: sites (list/create with authorization confirmation), scans (create with `Idempotency-Key` replay; keyset-paginated list with opaque microsecond-safe cursors; detail with `include=result`), findings, evidence index, HTML report stream, baselines. Per-key rate limiting (120/min), structured errors.
- **Cloud CI client** (`npm run scan:cloud`): resolves a site by id/name, triggers via API, polls to completion, prints findings, deterministic exit codes (0/1/2/64) — spec §71 cloud parity for CI.
- 10 integration tests driving the real route handlers against real Postgres (hashing, gating, scopes, revocation, idempotency, pagination incl. malformed cursors, baselines).

### Fixed
- Keyset cursors now carry Postgres's text timestamp (µs precision) — JS `Date` round-trips truncate to ms and silently skipped rows.

## [Unreleased] — 2026-08-23 (extension live-testing + security audit)

### Added
- Real-browser extension E2E suite (6 tests): full Chromium with the unpacked MV3 build, driving Quick Check, guided reject, persistence check, hashed JSON export, CT-001/CT-002/CT-003 flows against fixtures using production-KB tracker domains (`www.google-analytics.com`, `connect.facebook.net` → localhost), plus an automated production-manifest security-posture assertion (no pre-granted hosts, no web-accessible resources, default CSP, exact permission set).
- Test-build mode (`CT_EXT_TEST=1`, name suffixed "(TEST BUILD)") pre-granting fixture hosts for prompt-free automation; `?tabId=` pinned-panel debug hook (extension-privileged contexts only; disables tab-switch tracking when active).
- Fixture servers: configurable ports and tracker hostnames (parallel-suite isolation + production-KB classification testing).
- Extension "revoke" control returning a granted origin permission and clearing the session.

### Fixed
- **CT-003 false negative in the extension**: tracking requests fired synchronously inside a consent click predated the action timestamp (taken after `el.click()` returned); `clickByCtId` now timestamps before dispatching.
- Dashboard URL is sanitized to http(s) on save/load/open (blocks `javascript:`/`data:` schemes); exported HTML embeds only validated chrome-generated PNG data URIs.

### Security
- Audit (bundle + source + deps) recorded in docs/EXTENSION.md and docs/SECURITY.md: no eval/dynamic code, zero extension network calls, no HTML injection sinks, no message listeners, MV3 default CSP, `npm audit` 0 vulnerabilities.

## [Unreleased] — 2026-08-23 (launch hardening)

### Added
- **Domain verification** (spec §10): DNS TXT / HTML meta / well-known file checks with SSRF-validated, size- and time-capped fetching; per-site tokens; verify UI on the site page; unverified sites capped at `CT_UNVERIFIED_SITE_MONTHLY_CAP` scans/month, lifted on verification; `domain_verified` audit events.
- **Evidence retention sweeper**: plan-window expiry (rows cascade + storage removal), active-baseline scans always retained; runs at boot + every 6 h.
- **Notifications**: adapter with `log` and `resend` drivers; regression/failure alerts to owners/admins + configured email destinations; quiet on healthy scans; runner-wired and crash-isolated.
- **Stripe billing**: REST checkout sessions (owner-only endpoint), manual HMAC webhook signature verification (timing-safe, replay tolerance), idempotent event handling via `stripe_events` (checkout completion, subscription update/delete, payment failure), subscription status on organizations; billing UI upgrades via Stripe when configured, dev-mode switch otherwise.
- Migration `0003` (verification tokens, subscription columns, stripe_events) and GitHub Actions CI workflow (typecheck → 98-test suite → web build → extension zip artifact).
- Tests: Stripe signature suite (6), verification suite (6), integration additions (webhook idempotency, downgrade, unverified cap, retention sweep, notifications) — suite now 98 tests.

### Fixed
- Repo hygiene: untracked embedded-Postgres data dir and local evidence storage; ignore `.wxt/`, `.output/`, `storage/`, `.pgdata/`.

## [Unreleased] — 2026-08-23 (web platform)

### Added
- **Web application (`apps/web`, Next.js 16)** — dark marketing landing page with live-data-shaped evidence mock and entitlements-driven pricing; credentials auth (scrypt + hashed-token DB sessions, rate limiting, Origin-check CSRF); organizations with owner/admin/analyst/viewer RBAC; sites with mandatory authorization confirmation and plan limits; scan trigger → Postgres queue (`FOR UPDATE SKIP LOCKED`) → in-process Playwright runner → evidence persistence (scenario rows, findings, artifact index, summaries); flagship scan detail (scenario cards, consent-state matrix, findings with regression chips, evidence tabs incl. screenshots via authz-gated artifact streaming, hashed manifest link, HTML report); baselines with supersede-not-replace semantics; schedule CRUD + runner ticker (cron subset); billing page with usage meters and dev-mode plan switch (production = Stripe webhooks only); settings with team + audit trail; security headers/CSP.
- **Database tooling** — embedded PostgreSQL 17 dev server, transactional migration runner, migration `0002` (auth/sessions/queue-result columns).
- **Integration test suite** against real Postgres: scrypt round-trip, session hashing/expiry, entitlement limits, queue claim semantics (oldest-first, no double-claims), unauthorized-site rejection, baseline supersede history.
- Docs: API, AUTHORIZATION, BILLING, DATABASE, DEPLOYMENT; env template expanded.

### Changed
- Worker accepts a caller-supplied `scanId` so platform DB ids flow through evidence, manifests and baselines; result persistence takes the authoritative baseline row id.
- Repo-wide extensionless relative imports (Turbopack + vite + tsx + tsc compatibility).

### Fixed
- Baseline persistence type mismatch (worker-internal id vs DB uuid) surfaced by the live end-to-end demo.

## [Unreleased] — 2026-08-23 (extension)

### Added
- **Chrome extension (`apps/extension`)** — WXT Manifest V3 side panel implementing the full Quick Check workflow (spec §39–42): per-origin optional host permissions requested at scan time (no default site access), shared consent collector injected in the isolated world, cookie store capture with WebCrypto value hashing, storage snapshots, third-party request observation via resource timing, guided Test Reject / Test Accept with deterministic candidate selection (medium+ confidence only), manual capture mode, reload persistence check, live evidence timeline, screenshot strip, on-panel evaluation of the same deterministic rules as the worker (CT-001/002/003/005/007 with honest live-profile gating), per-origin "vs last check" deltas, local JSON + HTML evidence export with SHA-256 artifact hashes, light/dark themed panel UI, settings sheet, demo mode for previews and store screenshots, reproducible generated icon set, and Web Store release zip.
- Extension logic unit suites (session reducer, evidence/rule synthesis, exports, injected-function self-containment guard).
- Docs: EXTENSION.md, WEB_STORE.md, PRIVACY.md; README/TESTING updates.

### Changed
- In-page consent collector moved from the worker into `@consenttrace/scanner-core` (`cmp/inpage.ts`) so the worker and extension run one detection engine; functions now carry a first-statement `__name` shim making them safe under any esbuild-based runner.
- Root `typecheck` now includes the extension project. Root override pins vite 8 (wxt + @vitejs/plugin-react 6 compatibility).

## [Unreleased] — 2026-08-22

### Added
- Monorepo scaffold (npm workspaces, strict TypeScript, vitest).
- `@consenttrace/shared`: domain types, structured failure codes, registrable-domain helpers, scanner/rule-pack versions, product disclaimer.
- `@consenttrace/validation`: Zod scan schemas; SSRF-safe URL validation with DNS pre-resolution, private/metadata range blocking, port allowlist, redirect-revalidating navigation guard.
- `@consenttrace/scanner-core`: CMP signature KB (13 providers + TCF), multi-language deterministic consent-control classifier, safe candidate selection, cookie/network diff utilities.
- `@consenttrace/rule-engine`: versioned cookie KB (30+ signatures) and domain KB (45+ suffixes) with organization-override priority; deterministic rules CT-001…CT-010; baseline summarizer for regression comparison.
- `@consenttrace/evidence`: SHA-256 hashing, value-hash redaction, evidence recorder, timeline, tamper-evident manifest + verification.
- `apps/worker`: Playwright scan orchestrator (isolated context per scenario; no-action/reject/accept; snapshots at all phases; screenshots; persistence-by-reload; SSRF-guarded navigation), HTML/JSON evidence reports, CLI with CI exit codes (deterministic findings only).
- `apps/fixtures`: mode-switchable consent fixture site + synthetic third-party analytics/ads trackers via Chromium host-resolver rules.
- `packages/database`: migration 0001 — full core schema (tenancy, sites/verification, scans, observations, evidence, findings, baselines, schedules, overrides, AI governance, audit log).
- Tests: SSRF unit suite, classifier suites, per-rule suites, evidence integrity suite, E2E scanner suite (clean site, intentional regression vs baseline, reject-ignored, missing reject, SSRF blocks).
- Docs: README, ARCHITECTURE, DATA_MODEL, SCANNER_ENGINE, RULE_ENGINE, SECURITY, THREAT_MODEL, EVIDENCE_MODEL, CONSENT_STATES, TESTING, AI_ARCHITECTURE, PROMPT_REGISTRY, 8 versioned prompts, ADRs 0001–0005.
