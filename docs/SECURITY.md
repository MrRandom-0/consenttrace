# Security

**Purpose:** security controls across ConsentTrace. **Scope:** worker, API, web, extension, storage, AI. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## SSRF defense (implemented, tested)

Scanner URLs are hostile input. `packages/validation/src/ssrf.ts` enforces:

- **Protocols:** http/https only; `file://`, `ftp://`, `data:`, `chrome://` rejected at parse time. URLs with embedded credentials rejected.
- **Ports:** default allowlist {80, 443}; anything else blocked unless explicitly configured.
- **Hostnames:** `localhost`, `*.localhost`, `*.local`, `*.internal`, metadata hostnames, and **single-label names** (internal service names) blocked.
- **Addresses:** IP literals and **every DNS-resolved address** (resolved *before* navigation) checked against loopback, RFC1918, CGNAT, link-local (includes 169.254.169.254 and ECS metadata), TEST-NETs, multicast, reserved, IPv6 loopback/ULA/link-local, and IPv4-mapped IPv6 forms. Any private address in the answer set blocks the scan (rebinding defense).
- **Redirects:** every navigation and redirect revalidated via a stateful guard (`createNavigationGuard`), bounded redirect count (10). Blocked navigations abort with `SSRF_BLOCKED` and are recorded as security events in scan observations.
- **Escape hatch:** `allowPrivateTargets` exists for local fixture scanning only; it still enforces protocol/credential rules, is off by default, and must never be enabled for cloud scan traffic.
- **Defense in depth:** production workers additionally run in egress-restricted network environments; in-process checks are not the only barrier. Subresource requests (not just navigations) are constrained by that network policy — documented residual risk in THREAT_MODEL.md.
- Automated tests: `packages/validation/test/ssrf.test.ts` + E2E blocks in `apps/worker/test/scan.e2e.test.ts`.

## Domain authorization (cloud scanning)

Users must confirm they own or are authorized to test targets; higher scan volume requires domain verification (DNS TXT / HTML meta / file). Recorded per site: `verification_method`, `verified_at`, `verified_by`. Manual extension scans run in the user's own browser on pages they select; onboarding explains the authorization requirement. Per-tenant scan quotas prevent mass-scanning abuse.

## Tenant isolation

Every tenant table carries `organization_id`; RLS policies check membership (Supabase) or the API enforces the equivalent predicate on every query. Evidence object keys are prefixed by organization; reads only via short-lived signed URLs generated after an authorization check. Cross-tenant access is covered by tests before launch (Definition of Done).

## Data handling

- Cookie/storage **values never stored raw** — truncated SHA-256 digests only. Advanced debug capture requires explicit, logged opt-in.
- Network log: origin+path only; **never** authorization headers, session tokens, request bodies.
- Screenshots may contain page content: retention-controlled, access-controlled, optional redaction (Phase 2).

## Application security

Zod validation on every external input; secure session handling; CSRF protection on state-changing browser routes; rate limiting per user/org/IP; CSP on the web app; secure redirect allowlists; dependency + secret scanning in CI; webhook signature verification (Stripe et al.); structured errors without stack traces to clients.

## Extension security

Manifest V3, no remote code, no `eval`, no untrusted HTML injection (DOM APIs + text nodes only), **zero network calls** (nothing to exfiltrate to), no runtime message listeners (no spoofing surface), minimal + optional per-origin host permissions with a user-facing revoke control, no backend secrets or Stripe keys, page-derived data sanitized and treated as hostile, dashboard URL restricted to http(s), exports embed only validated chrome-generated PNG data URIs.

**Audited 2026-08-23** (bundle greps + real-browser E2E + `npm audit`, all clean — details in docs/EXTENSION.md). The production manifest posture (no pre-granted hosts, no web-accessible resources, default CSP, exact permission set) is asserted by an automated test on every run.

## Worker sandboxing

Isolated containers, no tenant credentials in the worker, memory/CPU limits, hard scan timeout, temp cleanup, egress restrictions.

## AI security

Data minimization (DOM fragments, not pages), redaction before send, prompt-injection defense (page text is data — see AI_ARCHITECTURE.md), invocation logging without raw payloads, deterministic safety validator before any AI-suggested interaction.

## Secrets

Server-only env vars validated at startup; never in client bundles or the extension; `.env.example` documents every variable with no real values.

## Incident response

See RUNBOOK.md / INCIDENT_RESPONSE.md (Phase 3). Security reporting contact: _placeholder before launch_.
