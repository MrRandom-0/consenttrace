# AI Architecture

**Purpose:** where AI is used, where it is prohibited, and how it is governed. **Scope:** all AI features. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Why AI exists

Deterministic detection covers known CMPs and clear text patterns. AI assists at the edges: unusual custom banners, ambiguous controls, unknown cookies, regression narration. It is an assistant; **deterministic browser evidence remains the source of truth.**

## Where AI may act

Detect custom banners · classify consent controls · suggest cookie categories · heal changed selectors · summarize regressions · suggest likely technical causes · write report narratives · explain technical results.

## Where AI is prohibited

Fabricating evidence (cookies, requests, timestamps, screenshots, scan events) · deciding deterministic pass/fail · overriding rule results · claiming legal compliance or giving legal advice · generating numerical scan facts in reports · clicking arbitrary elements.

## The fallback ladder

```
known CMP selector          → deterministic selector           (no AI)
no known selector           → heuristic detection              (no AI)
still ambiguous             → AI analysis (minimized input)
AI returns candidate        → deterministic safety validator
validator passes            → interaction permitted
validator fails / low conf. → manual review required
```

The safety validator checks: candidate is inside the detected consent UI, comes from the supplied candidate list, safe element type, meaning matches the requested action, visible and enabled, does not navigate to unrelated domains or submit financial/personal forms. Consent-button clicking requires **high** AI confidence *plus* validator pass.

## Confidence

Every AI classification carries `high | medium | low`. Low confidence never performs irreversible actions; it queues human review.

## Data minimization

Per invocation, send only: relevant sanitized DOM fragment, accessible text, element metadata, optionally a cropped banner screenshot, known heuristic findings. Redact emails, phone numbers, form data, account identifiers, user-entered content, auth information. Never send a whole site by default.

## Prompt-injection defense

Scanned websites are untrusted. Page-derived text travels only inside structured fields (e.g. `untrusted_page_text`), never as system/developer instructions; fixed system prompts subordinate all website-derived input; AI may only select candidates from supplied lists (no free-form selectors); the deterministic validator gates any interaction; injection fixtures (Fixture 12) run in CI.

## Invocation logging

`ai_invocations`: org, scan, feature, prompt_version, model, input_hash, redaction flag, timing, status, confidence, cost. Raw payloads are not logged unless an administrator explicitly enables debugging.

## Cost controls

AI only when deterministic logic fails or a premium explanation is requested; token caps; cropped inputs; model routing (small model first); result caching keyed by input hash; max AI calls per scan (`AI_MAX_CALLS_PER_SCAN`); org quotas; timeouts; bounded retries.

## Evaluation

Every prompt has offline fixtures (see PROMPT_REGISTRY.md): schema conformance, hallucination resistance, injection resistance, ambiguity handling, multi-language buttons. CI fails on schema breaks, unsupported actions, compliance claims, or invented evidence. Precision/recall tracked per prompt version; automated clicking optimizes aggressively against false-positive actions.

## Status

Prompts are versioned and checked in (`docs/prompts/`); runtime wiring lands in Phase 2 behind this governance. Nothing in Phase 1 calls a model.
