# ADR 0002 — Playwright worker

**Status:** accepted · **Date:** 2026-08-22

## Decision
Automated scans run on Node + TypeScript + Playwright + Chromium in isolated containers, one fresh BrowserContext per scenario.

## Context
Consent behavior is a browser-runtime property (JS-set cookies, dynamic banners, tag managers). HTTP-level scanners cannot observe it. Playwright provides context isolation, request interception, and deterministic control.

## Consequences
Real browser fidelity; heavier compute per scan (bounded by timeouts/limits); fixture-based deterministic CI (`--host-resolver-rules` for synthetic third parties).
