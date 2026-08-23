# ADR 0004 — AI fallback policy

**Status:** accepted · **Date:** 2026-08-22

## Decision
Fallback ladder: known CMP selector → heuristic detection → AI analysis → deterministic safety validator → interaction, else manual review. Consent clicks require high AI confidence AND validator pass.

## Context
AI is valuable for unusual banners but must never click arbitrary elements or hallucinate classifications (see docs/AI_ARCHITECTURE.md).

## Consequences
AI cost is bounded (invoked only after deterministic failure); every invocation logged with prompt version; low-confidence results queue human review instead of acting.
