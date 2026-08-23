# ADR 0001 — Monorepo

**Status:** accepted · **Date:** 2026-08-22

## Decision
One npm-workspaces monorepo for web, extension, worker and shared packages.

## Context
The scanner core, rule engine, evidence model and types are consumed by three runtimes (web, worker, extension). Separate repos would duplicate the domain vocabulary and drift.

## Consequences
Single typecheck/test surface; shared `@consenttrace/*` packages resolve from source in dev (tsx/vitest aliases); per-app build pipelines added as apps land.
