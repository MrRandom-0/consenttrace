# Chrome Web Store Readiness

**Purpose:** everything needed for a clean Web Store submission. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Single purpose statement

> ConsentTrace helps authorized website owners and consultants inspect, record and compare cookie-consent behavior in their browser.

## Short description (≤132 chars)

> Test cookie-consent states, record browser evidence and detect tracking regressions.

## Full description (draft)

ConsentTrace turns cookie-consent QA into evidence. Open any site you own or are authorized to test, run a Quick Check, and see exactly what the browser observed: the consent banner and its controls, every cookie (classified: necessary / functional / analytics / advertising), local storage, and third-party tracking requests — before and after Accept or Reject, and again after a reload to verify the choice persists.

- Deterministic checks, not vibes: the same rule engine as ConsentTrace cloud scans (pre-consent storage, reject-that-still-tracks, non-persistent preferences)
- Live evidence timeline with millisecond timestamps and screenshots
- One-click export: a client-ready HTML report or machine-readable JSON, hashed for tamper-evidence — everything stays on your machine
- "Vs last check" deltas per site: spot a new tracker the moment a deployment introduces it
- No default site access: you grant permission per site, at the moment you test it

ConsentTrace provides automated technical observations about website consent behavior. It does not provide legal advice or certify regulatory compliance. Only test websites you own or are authorized to test.

## Permission justifications (reviewer-facing)

| Permission | Justification |
| --- | --- |
| storage | Persists user settings and per-site check summaries locally. |
| sidePanel | The product UI is a side panel. |
| activeTab | Reads the current tab URL/title when the user clicks the toolbar action. |
| scripting | Injects the consent-banner detector and consent-button click helper into the inspected tab, only after per-site permission. |
| cookies | Reads the inspected site's cookie store to show what consent choices actually stored. |
| optional_host_permissions | Site access is requested per-origin when the user starts a check — never broad access at install. |

## Privacy disclosure (store form)

- Collects: nothing is transmitted off the device. Cookie/storage **values are hashed locally** before display or export; screenshots and evidence exports stay on the user's machine.
- No remote code; no analytics SDKs in the extension.
- Full policy: docs/PRIVACY.md (host at a public URL before submission — placeholder).

## Assets checklist

- [x] Manifest V3, version 0.1.0, versioned changelog (docs/CHANGELOG.md)
- [x] Icons 16/32/48/128 (generated, `apps/extension/scripts/gen-icons.mjs`)
- [x] Screenshots: `apps/extension/store/sidepanel-demo-{light,dark}.png` (1280-wide store crops TODO)
- [x] Release zip: `npm run -w @consenttrace/extension zip`
- [ ] Support contact — placeholder
- [ ] Website URL — placeholder (ships with the web app)
- [ ] Hosted privacy policy URL — placeholder
- [ ] Terms draft — Phase 3

## Review-risk notes

- Broad optional host permissions are justified by the user-directed testing model (any site the user is authorized to test); the request happens per-origin at use time, mirroring Chrome's recommended pattern.
- The extension never claims legal compliance; all copy uses observational language.
