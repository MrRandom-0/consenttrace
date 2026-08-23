# ADR 0005 — Evidence immutability

**Status:** accepted · **Date:** 2026-08-22

## Decision
Evidence artifacts are written once, hashed (SHA-256), and sealed in a hashed manifest. Storage uses write-once keys/versioned buckets. Marketing language: "tamper-evident artifact hashes", never "legally certified evidence".

## Context
Dated, verifiable evidence packages are the differentiator; silent mutation would destroy trust. Legal-certification claims would overstate what hashing provides.

## Consequences
`verifyManifest()` detects tampering; deletion is retention-policy-driven (whole artifacts), never in-place edits; report regeneration references the same immutable artifacts.
