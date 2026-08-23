# Data Model

**Purpose:** entities, relationships and modeling decisions. **Scope:** `packages/database/migrations`, `packages/shared/src/types.ts`. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## ERD (core)

```
User ──< OrganizationMember >── Organization
                                     │
                                     ├──< Site ──< SiteEnvironment ──< Scan ──< ScenarioRun
                                     │        (verification fields)     │           ├──< CookieObservation
                                     │                                  │           ├──< StorageObservation
                                     │                                  │           ├──< NetworkObservation
                                     │                                  │           └──< ConsentAction
                                     │                                  ├──< EvidenceItem
                                     │                                  ├──< Finding
                                     │                                  └──< Report
                                     ├──< Baseline (→ Scan, never silently replaced)
                                     ├──< ScanSchedule / NotificationDestination / Integration
                                     ├──< CookieOverride / DomainOverride / OrganizationRuleConfig
                                     ├──< AIInvocation (→ PromptVersion by id+version)
                                     └──< AuditLog
```

## Key decisions

1. **Values are hashed, not stored.** `cookie_observations.value_hash` / `storage_observations.value_hash` hold truncated SHA-256 digests. Change detection works via hash identity; raw values require an explicit, logged debug mode (not yet implemented).
2. **Network privacy normalization.** `url_normalized` = origin + path. No query strings, no auth headers, no bodies.
3. **Findings are denormalized onto organization_id** for cheap tenant-scoped queries and RLS.
4. **Baselines reference scans** and keep history (`superseded_at`) — setting a new baseline never destroys the previous record.
5. **Evidence rows are metadata**; bytes live in object storage under org-prefixed keys. `sha256` in Postgres makes integrity checkable independent of storage.
6. **Scan snapshot versions.** Every scan stores `scanner_version`, `rule_pack_version`, `browser_version` so historical results stay interpretable after upgrades.
7. **Classification provenance.** Every cookie category carries `classification_source` (`known_signature` / `organization_override` / `ai_suggested` / `unclassified`) — AI suggestions are never silently authoritative.
8. **First-party detection** uses registrable-domain comparison with an embedded multi-label suffix subset; full Public Suffix List integration is a tracked limitation.
9. **Enums in Postgres** for statuses/categories shared with TypeScript union types in `@consenttrace/shared` — one vocabulary across DB, API, worker and UI.

## TypeScript ↔ SQL mapping

`packages/shared/src/types.ts` is the wire format (worker output, API payloads); migration `0001_init.sql` is the storage format. The API layer owns the mapping; scenario-level JSON (timeline, screenshots map) persists as evidence artifacts rather than rows, keeping the relational model lean.

## Failure modes

Orphaned evidence on partial scan failure → scans marked failed keep their partial evidence for debugging, subject to retention. Enum drift between TS and SQL → prevented by adding values in migration + shared types in the same PR (Documentation Update Rule).

## Future

Consent Mode observation table (Phase 2), action-inventory table for CT-011, IndexedDB name observations, per-scan region profiles, PSL-backed party classification.
