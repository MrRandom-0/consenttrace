# Privacy

**Purpose:** what ConsentTrace components read, store and transmit. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Principles

1. Test evidence describes *website behavior*, not people. We minimize anything person-adjacent by design.
2. Values are hashed at capture time; raw cookie/storage values are never persisted (explicit, logged debug mode excepted — not yet implemented).
3. The extension is local-only today: nothing leaves the browser. Workspace sync will be explicit and opt-in.

## What the extension reads (per-site, after the user grants that site)

- The inspected tab's URL/title (activeTab), the detected consent interface (text + control metadata), the site's first-party cookie store (values hashed immediately via WebCrypto), localStorage/sessionStorage keys (values hashed, lengths kept), resource-timing request URLs (normalized to origin+path), and user-triggered viewport screenshots.

**Stored locally:** settings and per-origin summaries (cookie counts, tracking cookie *names*, tracking domains, finding counts). **Never stored:** raw values, auth headers, request bodies, form input. **Transmitted:** nothing.

## What cloud scanners collect (when the platform ships)

Per authorized site: cookie attributes with hashed values, storage keys with hashed values, normalized request metadata (origin+path, no query strings, no auth headers, no bodies), screenshots of the scanned pages, consent-action records, timelines, rule findings. Workers run against customer-authorized domains only (ownership confirmation + domain verification at volume) with per-tenant quotas.

## Screenshot handling

Screenshots can contain page content. Extension: kept in the session and user exports only. Cloud: retention-controlled objects, org-scoped keys, short-lived signed URLs; optional redaction is on the roadmap (Phase 2).

## AI processing (Phase 2, transparent by design)

AI features receive minimized inputs only (sanitized DOM fragments, accessible text, candidate metadata, optionally a cropped banner screenshot) with emails, phone numbers, form data, account identifiers and auth information redacted before send. Every invocation is logged (`ai_invocations`) with prompt version and input hash — raw payloads are not logged unless an administrator explicitly enables debugging. AI never receives full-site content by default. See docs/AI_ARCHITECTURE.md.

## Retention & deletion

Plan-based evidence retention with automatic expiry; immediate manual deletion; site/workspace/account deletion cascades to evidence artifacts and metadata (docs/DATA_RETENTION.md, Phase 2/3, documents exact semantics). Audit-log retention is configured separately.

## Third-party processors

To be enumerated before launch (hosting, object storage, email, payments/Stripe, AI provider) with regions and purposes. Placeholder until production vendors are locked.

## Export

Customers can export their evidence (JSON/HTML today in the extension; API export ships with the platform).

## Customer responsibilities

Customers must only test websites they own or are authorized to test, and are responsible for how exported evidence is shared. ConsentTrace provides technical observations, not legal advice.
