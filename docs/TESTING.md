# Testing

**Purpose:** test strategy and inventory. **Scope:** all packages/apps. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Principles

- Deterministic CI: scanner tests run against **local fixture sites** (`apps/fixtures`), never live websites.
- Security tests (SSRF, prompt injection) are release gates, not optional suites.
- Every bug fix lands with a test.

## Fixture sites (implemented subset)

| Fixture | Behavior | Exercises |
| --- | --- | --- |
| clean (`/fixtures/clean`, mode `clean`) | Correct banner: accept loads tags, reject doesn't, choice persists | E2E test 1, CT-001…007 passes |
| pre-consent tracking (mode `pre_consent_tracking`) | `_ga`/`_fbp` + tracker requests fire on load, before any choice | CT-001, CT-010 regression |
| reject ignored (mode `reject_ignored`) | Reject click still fires analytics + ad pixel | CT-002, CT-003 |
| no reject (mode `no_reject`) | Banner has Accept + Close only | CT-004, `reject_action_not_found` |
| no banner (mode `no_banner`) | No consent UI at all | CT-005 |

The same URL (`/site`) switches behavior via `/__fixture/set?mode=…` — simulating a deployment regression against a stable URL. Planned fixtures (Phase 2): preference center, delayed tracking script, CMP-in-iframe, shadow-DOM banner, SPA navigation, banner wording change, fake non-consent modal, prompt-injection page.

Third-party realism: fixture hostnames (`site.fixture.test`, `metrics.fxanalytics.example`, `cdn.fxtracker.example`) map to 127.0.0.1 via Chromium `--host-resolver-rules`, so cross-domain requests are genuinely third-party without external DNS.

## Suites

- **Unit** (`npm run test:unit`): SSRF validation (protocols, ranges, DNS rebinding, redirects, ports), consent-control classification (multi-language, negations, ambiguity), cookie/domain KB + override priority, rules CT-001…CT-010 against synthetic evidence, baseline summarization, evidence hashing + manifest tamper detection, registrable-domain logic. Extension: session reducer transitions, observation builders (hashing, sameSite mapping, resource classification/normalization), rule synthesis parity incl. live-profile CT-001 gating and manual-mode limits, export integrity (hashed, value-free, no legal claims), and a self-containment guard asserting injected functions carry the `__name` shim and no module references.
- **E2E** (`npm run test:e2e`): SSRF blocks before browser launch; clean-site full scan (detection, actions, snapshots, persistence, manifest verification, zero findings); baseline → “deployment” → regression scan (CT-001/008/009/010); reject-ignored (CT-002/003); missing reject (CT-004, structured observation, no legal language).
- **Typecheck as lint**: strict TS with `noUncheckedIndexedAccess` across all workspaces.
- **Extension E2E (implemented)**: real Chromium (`launchPersistentContext` + `--load-extension`, new headless) drives the side panel against fixtures — Quick Check, guided reject, persistence, hashed JSON export, CT-001/002/003 flows with production-KB tracker domains resolved to localhost, plus a production-manifest security-posture assertion. Permission prompts are bypassed via a clearly-marked test build (`CT_EXT_TEST=1`) that pre-grants fixture hosts; the panel targets its tab via the `?tabId` hook.
- **Planned**: component tests for the web app (scan detail, diff viewer, evidence viewer, empty/error states), AI prompt evaluation fixtures (schema conformance, hallucination resistance, injection resistance), Stripe live checkout in test mode (signature/webhook logic is covered), WCAG 2.2 AA checks.

## CI plan

install → typecheck → unit → E2E scanner fixtures → security suites → production builds. Deployment requires green CI; migrations reviewed.
