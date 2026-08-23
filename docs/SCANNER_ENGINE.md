# Scanner Engine

**Purpose:** how the Playwright worker turns a URL into deterministic consent evidence. **Scope:** `apps/worker`, `packages/scanner-core`. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Browser lifecycle & scenario isolation

- One Chromium instance per scan; **one fresh `BrowserContext` per scenario** (clean cookies, storage, cache). Cookies are never reused between scenarios; persistence is tested *within* a scenario via reload only.
- Context config: viewport (default 1366×900), locale (default `en-GB`), optional timezone. Contexts are always closed in `finally`; the browser closes when the scan ends.
- Hard limits: navigation timeout (default 30 s), banner wait budget (default 8 s), settle window (default 3 s), whole-scan timeout (default 180 s → remaining scenarios `skipped` with `WORKER_TIMEOUT`).

## Scenario procedure (per docs/CONSENT_STATES.md)

1. Create context → attach request/response/console listeners → install SSRF navigation guard (`context.route`).
2. Navigate; capture `after_page_load` cookie + storage snapshots and the `initial_page` screenshot.
3. **CMP detection**: poll the in-page collector (400 ms interval) until a consent surface is visible or the banner budget is spent.
4. Scenario action (accept/reject): classify candidates deterministically, click only medium+ confidence matches, capture before/after screenshots and `immediately_after_action` cookies.
5. Wait the settle window; capture `after_settle` cookies/storage; emit `cookie_created` timeline events for new cookies.
6. Persistence: reload, re-run detection (`bannerAfterReload`), capture `after_reload` snapshots + screenshot.
7. Write the normalized network log; close the context.

## CMP detection

Layered, never trusting one selector:

1. **Known signatures** (`packages/scanner-core/src/cmp/signatures.ts`): DOM selectors + window APIs for Cookiebot, OneTrust, Didomi, Usercentrics, Quantcast, CookieYes, Osano, TrustArc, Complianz, Axeptio, Klaro, Termly, Iubenda; plus IAB `__tcfapi` presence as framework evidence.
2. **Generic heuristic**: overlay-ish elements (fixed/sticky/dialog roles, id/class/aria hints containing cookie/consent/cmp/gdpr) containing multi-language consent keywords and at least one control; scored by keyword hits, positioning and z-index.
3. Detection output: provider (if evidenced), confidence (selector 0.95 / API 0.7 / heuristic 0.6), evidence entries, banner text (truncated), candidate controls.

The collector runs via `page.evaluate` and must stay fully self-contained (`apps/worker/src/inpage.ts`). It tags the container and candidates with `data-ct-id` attributes so clicks are addressed at elements the detector actually saw.

## Consent action execution

- Candidates are classified from visible text + aria-label by `classifyConsentControl` (ordered pattern groups; negated-accept phrasing like “Do not accept” is checked before accept keywords; multi-language).
- `selectActionCandidate` picks the highest-confidence visible+enabled match; ties → shortest text → document order. Default minimum confidence: **medium**. Low-confidence dismissals (“OK”) are never clicked silently.
- Missing action → structured observation (`reject_action_not_found` / `accept_action_not_found`), scenario `completed_with_observations`, **no legal claim**.
- Action safety (applies to future AI-suggested candidates too): candidate must come from inside the detected consent UI, be a safe element type, visible and enabled; consent-related interactions only.

## Capture rules

- **Cookies** (`context.cookies()`): name, domain, path, attribute set, session/expiry, first- vs third-party (registrable-domain comparison), category + classification source + vendor from the KB with organization overrides. **Values are hashed (`sha256:` prefix, truncated) — never stored raw.** Advanced debug capture requires an explicit, logged opt-in (not yet implemented).
- **Storage**: localStorage/sessionStorage keys with hashed values + lengths (≤200 keys per store).
- **Network**: URL normalized to origin+path (query/fragment stripped), domain, method, resource type, ms offset, category/vendor from domain KB + overrides, third-party flag, status. **Never** auth headers or request bodies.
- **Screenshots**: viewport PNGs at initial page, banner visible, before/after each consent click, after reload. Full-page and redaction options are Phase 2.
- **Console errors**: first 25, as observations.

## Failure handling & retries

Structured failure codes (`packages/shared/src/failure-codes.ts`) on scenario and scan. Bounded retries are queue-level policy (Phase 2): navigation timeout → one retry with extended timeout; CMP not detected → one retry with longer banner wait; ambiguous action → **never clicked**, marked needs-review.

## Performance

Contexts/browsers always closed; per-scan timeout; ≤1 page per scenario; screenshot size bounded by viewport; snapshots capped (200 storage keys, 30 cookie-created events, 25 console errors).

## Testing

Unit: classifier, diffs, SSRF. E2E (`apps/worker/test/scan.e2e.test.ts`): clean banner, pre-consent tracking, reject-ignored, missing reject, baseline regression, SSRF blocks — all against local fixtures (`apps/fixtures`).

## Future

Shadow-DOM and cross-origin CMP iframe traversal, preference-center automation (essential-only), withdraw flow, Consent Mode analyzer, scroll-trigger option, request-body-free POST beacon classification.
