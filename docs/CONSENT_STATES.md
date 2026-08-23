# Consent States & Scenario Procedures

**Purpose:** define each tested consent scenario precisely. **Scope:** worker scenario logic. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

Every scenario starts from a **fresh browser context** (clean cookies/storage). Cookies are never reused across scenarios; persistence is tested via in-scenario reload only.

## A — No Action (`no_action`) — implemented

Observe pre-choice behavior. Load page → do not interact → wait settle window → capture cookies/storage/network → evaluate pre-consent storage, tracking requests, banner visibility. Optional scroll trigger: Phase 2.

## B — Reject All (`reject_all`) — implemented

Load → detect consent UI → find reject-style action (deterministic text/aria classification; known-CMP selectors first) → screenshot before → click → screenshot after → settle → capture → reload → verify persistence (banner should not return) → capture `after_reload`.
If no reject action exists: structured observation `reject_action_not_found`, scenario `completed_with_observations`, CT-004 fires as a **technical** finding. No legal noncompliance is declared.

## C — Accept All (`accept_all`) — implemented

Same procedure with the accept action. Provides the comparison baseline: what the site does when everything is permitted.

## D — Essential Only (`essential_only`) — Phase 2

Open preference center → detect categories → disable optional categories → keep required enabled → save → capture. Deterministic automation first; AI fallback only behind the safety validator.

## E — Withdraw Consent (`withdraw_consent`) — Phase 2

Accept → reload → reopen consent settings → withdraw → save → capture. Report must distinguish: cookies removed vs retained, future requests stopped, preference stored.

## F — Custom Preferences (`custom_preferences`) — Phase 2

Organization-defined category selections.

## Persistence semantics

`bannerAfterReload=false` after an action ⇒ preference persisted (pass for CT-007). `true` ⇒ CT-007 finding (technical observation: the choice may not persist).

## Observation language

All outputs use: “observed” / “none observed during this test” / “potential issue” / “requires review”. Never: “compliant”, “illegal”, “GDPR violation”.
