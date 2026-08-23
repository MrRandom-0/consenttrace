# ADR 0003 — Deterministic evidence is the source of truth

**Status:** accepted · **Date:** 2026-08-22

## Decision
The browser recorder produces facts; the deterministic rule engine interprets facts; AI may only explain. AI never decides pass/fail, never creates or mutates evidence, never drives CI failure.

## Context
The product sells *proof*. Any probabilistic step in the evidence path would poison every downstream claim.

## Consequences
Evidence is written and hashed before rules run; rules run before AI; reports derive all numbers from evidence JSON; AI features are removable without weakening results.
