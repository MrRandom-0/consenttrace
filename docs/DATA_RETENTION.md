# Data Retention

**Purpose:** exact deletion semantics for evidence and account data. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Evidence retention (implemented)

- Retention window = the organization's plan entitlement (`evidenceRetentionDays`: Free 7 · Pro 90 · Agency 365 · Scale 730).
- The **retention sweeper** (`apps/web/src/server/retention.ts`) runs at boot + every 6 hours: it deletes scans older than the window — database rows cascade (scenario runs, observations, findings, evidence index) and the scan's storage directory is removed.
- **Active-baseline scans are never expired**: a pinned baseline keeps its full evidence regardless of age, because regression comparison depends on it. When a baseline is superseded, its metadata row remains (audit history) but the underlying scan evidence becomes eligible for expiry.
- Integration-tested: expired scans deleted (rows + artifacts), pinned scans retained, fresh scans untouched.

## Manual deletion (implemented via cascade)

- **Site archive/delete** → environments → scans → evidence rows cascade; storage cleanup follows the sweeper.
- **Workspace deletion** → all tenant rows cascade from `organizations`.
- **Account deletion** → sessions and memberships cascade from `users`.

## What is never stored

Raw cookie/storage values (hashed at capture), auth headers, request bodies, query strings. See PRIVACY.md.

## Audit-log retention

Audit rows are workspace metadata, not evidence; they follow workspace lifetime (configurable window is a Phase 3+ setting).

## Extension

Local-only: settings + per-origin summaries in `chrome.storage.local` (30-origin LRU); session evidence lives in memory and user-initiated exports. Uninstalling the extension removes stored data.

## Future

Per-organization retention overrides below plan maximums; hash-only audit exports that outlive artifacts (prove existence without content); S3 lifecycle rules mirroring DB windows.
