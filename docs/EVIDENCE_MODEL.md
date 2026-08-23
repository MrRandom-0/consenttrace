# Evidence Model

**Purpose:** define what evidence is captured, how it is stored, and how integrity is protected. **Scope:** `packages/evidence`, worker capture. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Principles

1. Evidence is a first-class product feature — the moat is *proof*, not scanning.
2. Evidence is deterministic and written before any AI runs; AI can never create, alter or delete evidence.
3. Evidence is privacy-preserving by default: values hashed, URLs normalized, no auth material.
4. Evidence is tamper-evident: per-artifact SHA-256 sealed in a hashed manifest. We say “tamper-evident artifact hashes”, **never** “legally certified evidence”.

## Snapshot phases

`before_page` (implicit: fresh context) · `after_page_load` · `before_consent_action` · `immediately_after_action` · `after_settle` · `after_reload`.

## Artifacts per scenario

| Artifact | Type | Contents |
| --- | --- | --- |
| `screenshot-*.png` | screenshot | initial page, banner visible, before/after click, after reload |
| `cookies-{phase}.json` | cookie_snapshot | attributes + hashed values + classification |
| `storage-{phase}.json` | storage_snapshot | keys + hashed values + lengths |
| `network.json` | network_log | normalized requests with categories/vendors/timing |
| `consent-ui.json` | html_snippet | banner text + candidate controls + signature matches |
| `consent-action.json` | html_snippet | action record with confidence + screenshot links |

Scan-level: `timeline.json` (all events, ms offsets), `manifest.json`, `scan.json` (full result), `report.html`.

## Timeline

Every meaningful event is recorded with a millisecond offset from scenario start and an ISO timestamp: context creation, navigation, banner detection, snapshots, screenshots, consent clicks, cookie creations, tracking requests, persistence checks, failures. The report and (future) evidence viewer render this as the scenario's narrative.

## Integrity

- Each artifact: `sha256`, byte size, created-at, registered in the manifest.
- Manifest: artifacts sorted by path; `manifestSha256 = sha256(JSON(artifacts))`; verification via `verifyManifest()` (used in tests; exposed in product later).
- Storage: write-once object keys / versioned buckets in production.

## Retention & deletion

Retention days are an entitlement. Deletion (site, workspace, account, manual evidence delete) removes artifacts and metadata; hashes in audit exports may outlive artifacts to prove *that* something existed without retaining content. Precise behavior documented in DATA_RETENTION.md (Phase 2/3).

## Failure modes

Screenshot failure → observation recorded, scenario continues. Artifact write failure → scan fails (`EVIDENCE_UPLOAD_FAILED`); a scan without complete evidence is not a completed scan.

## Testing

`packages/evidence/test/`: hash determinism, manifest verification, tamper detection. E2E verifies manifests for real scans.

## Future

Signed manifests (org-scoped keys), evidence viewer deep links, redaction pipeline for screenshots, export bundles (ZIP with manifest verification instructions).
