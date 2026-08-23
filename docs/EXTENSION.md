# Chrome Extension

**Purpose:** manual consent QA and evidence capture in the user's own browser. **Scope:** `apps/extension` (WXT, Manifest V3, React, Tailwind). **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## What it does

The side panel runs the **Quick Check** workflow entirely locally (spec §42 — no cloud required):

1. User opens a website and the ConsentTrace side panel (toolbar button).
2. **Run Quick Check** → requests permission for *that origin only* → detects the consent banner with the **same shared collector the cloud worker uses** (`@consenttrace/scanner-core`), classifies its controls, snapshots cookies (values hashed), localStorage/sessionStorage (hashed), and third-party requests via resource timing, and captures a screenshot.
3. **Test Reject / Test Accept** → clicks the classified control (medium+ confidence only), waits a settle window, re-snapshots, and diffs. **Capture changes** covers manual interactions.
4. **Check persistence** → reloads and verifies the banner does not return.
5. The panel evaluates the **same deterministic rules as the worker** (CT-001/002/003/005/007) against the captured evidence and shows a live timeline.
6. **Export report / Export JSON** → self-contained evidence files download locally. A per-origin summary enables "vs last check on this site" deltas.

## Architecture

- `entrypoints/background.ts` — minimal service worker; only wires the toolbar action to the side panel. No relays, no secrets.
- `entrypoints/sidepanel/` — React app; calls extension APIs directly.
- `lib/chromex.ts` — typed chrome facade (permissions, scripting, cookies, capture, reload).
- `lib/inject.ts` + shared `collectConsentSurfaces`/`collectStorage` — self-contained functions injected via `chrome.scripting.executeScript` in the **ISOLATED world** (hostile pages cannot tamper with them; page JS globals are intentionally invisible, so CMP window-API evidence is worker-only).
- `lib/evidence.ts` — pure observation builders + rule synthesis (unit-tested).
- `lib/session.ts` — pure session reducer (unit-tested).
- `lib/export.ts` — local JSON/HTML evidence export with SHA-256 artifact hashes (WebCrypto).

## Permissions (all justified, spec §40)

| Permission | Why |
| --- | --- |
| `storage` | Settings + per-origin check summaries (no values, no screenshots persisted) |
| `sidePanel` | The entire UI |
| `activeTab` | Read the current tab's URL/title when the user invokes the toolbar action |
| `scripting` | Inject the consent collector and consent-click helpers on the inspected tab |
| `cookies` | Read the first-party cookie store (incl. HttpOnly) for the inspected site |
| `optional_host_permissions: http(s)://*/*` | **Requested per-origin at Quick Check time.** No default host access; never `<all_urls>` up front |

Not requested: `tabs` (browsing history warning), `webRequest`, `downloads`, `history`.

## Honest limitations

- Live-profile testing: the browser may already hold a consent state — the panel says so and gates pre-consent rules (CT-001 only runs while the banner is pending). Clean-state scenario matrices are the cloud worker's job.
- Third-party **cookies** for other origins aren't readable without their host permissions; third-party **requests** are still observed via resource timing (buffered, no headers).
- Cross-origin CMP iframes aren't traversed yet (worker roadmap item too).

## Security (spec §79)

MV3; no remote code; no `eval`; no untrusted HTML injection (page data rendered as text); isolated-world injection; `data-ct-id`-addressed clicks restricted to detected consent controls at medium+ confidence; no backend or Stripe secrets; evidence never leaves the browser (workspace sync ships with the cloud API and will be opt-in).

## Real-browser E2E (implemented)

`apps/extension/test/extension.e2e.test.ts` loads the built MV3 extension into **full Chromium** (new headless, `channel: 'chromium'`, `launchPersistentContext`) and drives the side panel UI against the local fixtures: Quick Check baseline on a clean site (banner detection, control classification, zero findings), guided Test Reject + persistence check, local JSON export (hashed, value-free, disclaimed), CT-001 on a pre-consent-tracking site, and CT-002 + CT-003 on a reject-ignored site — using **real knowledge-base tracker domains** (`www.google-analytics.com`, `connect.facebook.net`) resolved to localhost, so no test-only classification overrides run in the panel.

Automation hooks (both inert in normal use):
- **Test build** (`CT_EXT_TEST=1 npx wxt build`): pre-grants fixture host permissions so `chrome.permissions.request` resolves without a native prompt, and renames the extension "(TEST BUILD)". The suite's final test rebuilds production output and asserts the prod manifest has **no** `host_permissions`, no web-accessible resources, no CSP relaxation, and exactly the five declared permissions.
- **Pinned tab** (`sidepanel.html?tabId=N`): inspects a specific tab and disables tab-switch tracking. Panel pages are not web-accessible, so only extension-privileged contexts can set it; pinning grants nothing beyond the normal per-origin permission flow.

Bug found and fixed by this suite: consent handlers that fire tracking requests *synchronously inside the click* predated the action timestamp (taken after `el.click()` returned), so CT-003 missed them — `clickByCtId` now timestamps before dispatching.

## Security audit (2026-08-23)

Verified on the production build: no `eval`/`new Function`/`importScripts`; no remote code or telemetry — the extension makes **zero network calls** (the only URLs in the bundle are XML namespaces and React error-message strings); no `innerHTML`/`dangerouslySetInnerHTML`/`document.write` (page data renders as text nodes); no `chrome.runtime` message listeners (no spoofing surface); MV3 default CSP unrelaxed; `npm audit`: 0 vulnerabilities (prod + dev). Hardening added: dashboard URL sanitized to http(s) at save, load and open (blocks `javascript:`/`data:` schemes); exported HTML embeds only chrome-generated `data:image/png;base64` screenshots (base64-validated); a **revoke** control on the page card removes the granted origin permission and clears the session.

## Build & test

```bash
npm run -w @consenttrace/extension build       # .output/chrome-mv3
npm run -w @consenttrace/extension zip         # Web Store release zip
npm run -w @consenttrace/extension typecheck
npm run test:unit                              # includes extension logic suites
node apps/extension/scripts/gen-icons.mjs      # reproducible icon set
node apps/extension/scripts/screenshot-demo.mjs # store screenshots (?demo=1 mode)
```

Load unpacked: `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/.output/chrome-mv3`.

## Failure modes

Permission denied → session stays idle with a plain explanation. Unsupported pages (chrome://, store) → explicit unsupported state. Click/reload failures → structured error codes in the timeline, evidence preserved. Screenshot rate limits → capture skipped, flow continues.

## Future

Workspace sync (upload evidence to an authorized ConsentTrace org), compare against latest **cloud** scan, preference-center (essential-only) guided flow, withdraw flow, screenshot redaction, Firefox target via WXT.
