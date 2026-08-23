# ConsentTrace

**Test consent. Detect regressions. Prove what happened.**

ConsentTrace is a cookie-consent regression testing and evidence platform. It runs websites through multiple consent states (no action, reject all, accept all, and more) in isolated browser contexts, records objective evidence — cookies, storage, network requests, screenshots, timestamped timelines — evaluates deterministic technical rules, and compares results against baselines to catch regressions introduced by deployments.

> ConsentTrace provides automated technical observations about website consent behavior. Results depend on the tested configuration, location, browser environment and scan timing. ConsentTrace does not provide legal advice or certify regulatory compliance.

## Architecture

```
Chrome Extension ──┐
                   ├──► ConsentTrace API ──► PostgreSQL / Object storage
Web dashboard ─────┘            │
                                ▼
                          Job queue
                                │
                                ▼
                     Playwright workers (isolated containers)
                                │
                                ▼
                      Evidence (hashed artifacts)
                                │
                                ▼
                   Deterministic rule engine  ◄── versioned cookie/domain KB
                                │
                                ▼
                    AI assistant (explains, never decides)
                                │
                                ▼
                       Reports · Alerts · CI results
```

Deterministic browser evidence is captured **before** any AI analysis and remains the sole source of truth. See `docs/ARCHITECTURE.md`.

## Repository structure

```
consenttrace/
  apps/
    worker/        Playwright scan worker + CLI (implemented)
    fixtures/      Local consent-fixture websites for deterministic testing (implemented)
    extension/     WXT Manifest V3 side-panel extension (implemented)
    web/           Next.js dashboard (next up)
  packages/
    shared/        Domain types, failure codes, domain helpers
    validation/    Zod schemas + SSRF-safe URL validation
    scanner-core/  CMP signatures, consent-action classifier, diff utilities
    rule-engine/   Cookie/domain knowledge bases + deterministic rules CT-001…CT-012
    evidence/      SHA-256 hashing, evidence recorder, tamper-evident manifest
    database/      PostgreSQL migrations
  docs/            Product, architecture, security and AI documentation
```

## Prerequisites

- Node.js ≥ 20
- npm ≥ 10
- Chromium via `npx playwright install chromium`
- PostgreSQL 15+ (for the web app/API; the worker slice runs standalone)

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env       # fill in values; never commit .env
```

## Run the fixture sites

```bash
npm run fixtures
# Fixture site:   http://site.fixture.test:4300/site  (mode-switchable)
# Fixed fixtures: /fixtures/clean, /fixtures/pre-consent-tracking,
#                 /fixtures/reject-ignored, /fixtures/no-reject, /fixtures/no-banner
```

Fixture hostnames resolve inside the scanner via Chromium `--host-resolver-rules`; no real DNS or external websites are involved.

## Run a scan

```bash
# Scan the local fixture site across three consent states:
npm run scan -- http://site.fixture.test:4300/site --fixture-dns --out scan-output/demo

# Compare against a baseline (regression rules CT-008…CT-010):
npm run scan -- http://site.fixture.test:4300/site --fixture-dns \
  --baseline scan-output/demo/scan.json --out scan-output/after-deploy

# CI mode: exit non-zero on deterministic findings at/above a severity:
npm run scan -- https://example.com --fail-on high
```

Outputs per scan: `scan.json` (machine-readable result), `report.html` (client-ready evidence report), per-scenario screenshots, cookie/storage/network snapshots, `timeline.json`, and `manifest.json` with SHA-256 hashes for every artifact.

## Tests

```bash
npm run typecheck    # strict TypeScript across all packages
npm run test:unit    # SSRF, classifiers, rules, evidence, diff units
npm run test:e2e     # full Playwright scans against fixtures (SSRF, clean site,
                     # intentional regression vs baseline, reject-ignored, missing reject)
```

## Security

- Scan targets are hostile input: SSRF validation resolves DNS before navigation, blocks loopback/private/link-local/metadata ranges, restricts ports, and revalidates every redirect. See `docs/SECURITY.md` and `docs/THREAT_MODEL.md`.
- Cookie and storage **values are never stored raw** — only salted-format SHA-256 digests.
- Evidence artifacts are hashed individually and sealed in a hashed manifest (tamper-evident, not legally certified).
- Security reporting: see `SECURITY.md` contact placeholder (to be filled before launch).

## Status

| Slice | Status |
| --- | --- |
| Scan worker (no-action / reject / accept, isolated contexts) | ✅ implemented + tested |
| Evidence pipeline (hashes, manifest, timeline, screenshots) | ✅ implemented + tested |
| Deterministic rules CT-001…CT-010 | ✅ implemented + tested |
| Baseline regression comparison | ✅ implemented + tested |
| HTML/JSON reports | ✅ implemented |
| SSRF defenses + tests | ✅ implemented + tested |
| Database schema | ✅ migration written |
| Chrome extension (WXT MV3 side panel: Quick Check, guided consent tests, persistence check, local evidence export, store zip) | ✅ implemented + tested |
| Web app: marketing landing, auth (scrypt + sessions), orgs/RBAC, sites with authorization confirmation, scan trigger → queue → runner → evidence viewer, consent matrix, findings, baselines, schedules, billing/entitlements, audit log | ✅ implemented + live-tested |
| Postgres queue (FOR UPDATE SKIP LOCKED) + in-process runner + schedule ticker | ✅ implemented + integration-tested |
| Real-Postgres integration suite (auth, entitlements, queue, baselines) | ✅ 7 tests |
| Domain verification (DNS TXT / meta tag / well-known file) + unverified-site scan cap | ✅ implemented + tested |
| Evidence retention sweeper (plan windows; active baselines always kept) | ✅ implemented + tested |
| Email notifications (regression/failure alerts; log + Resend drivers) | ✅ implemented + tested |
| Stripe billing: checkout sessions, HMAC-verified idempotent webhooks, subscription state | ✅ implemented + tested (needs live keys) |
| GitHub Actions CI (typecheck, 98-test suite, builds, extension artifact) | ✅ workflow committed |
| Public /v1 API: hashed org API keys (read/write scopes), sites/scans/findings/evidence/report/baselines endpoints, Idempotency-Key replay, keyset pagination, per-key rate limits, cloud CI client (`npm run scan:cloud`) | ✅ implemented + 10 integration tests |
| AI-assisted detection/summaries — prompts versioned + governed (docs/prompts); runtime intentionally not wired yet (deterministic evidence ships first) | 📝 |

## License

License placeholder — to be chosen before public release.
