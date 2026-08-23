# Prompt Registry

**Purpose:** authoritative index of production prompts. Prompts are product code: versioned, evaluated, owned. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

Every prompt lives in `docs/prompts/` (source of truth mirrored into `packages/prompts/` when runtime wiring lands) and is registered in `prompt_versions`. Updates require: new version → evaluation run → regression comparison → CHANGELOG entry → approval before production. Never edit a production prompt in place.

| Prompt ID | Version | Feature | Model | Structured output | Fallback | Human review threshold | Last evaluation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SYSTEM_PROMPT | v1 | Global AI system prompt | all | n/a | n/a | n/a | pending (pre-wiring) | _placeholder_ |
| CMP_DETECTION | v1 | Custom banner detection | routing: small→large | JSON (isConsentInterface, actions[], confidence) | heuristic-only result | confidence < high | pending | _placeholder_ |
| CONSENT_ACTION_CLASSIFIER | v1 | Button classification | small | JSON per candidate | unknown classification | ambiguous → unknown | pending | _placeholder_ |
| COOKIE_CLASSIFIER | v1 | Unknown-cookie suggestions | small | JSON (category, confidence, signalsUsed) | category=unknown | always labeled AI suggestion | pending | _placeholder_ |
| SELECTOR_HEALER | v1 | Selector recovery | large | JSON (candidateId, requiresHumanReview) | manual review | confidence < high → human review | pending | _placeholder_ |
| REGRESSION_SUMMARIZER | v1 | Diff narration | large | JSON (summary, causes, checks) | deterministic diff only | n/a (explanatory) | pending | _placeholder_ |
| ROOT_CAUSE_ANALYST | v1 | Engineering cause suggestions | large | sectioned output | none (optional feature) | n/a (explanatory) | pending | _placeholder_ |
| REPORT_NARRATIVE | v1 | Client-facing narrative | large | sectioned text | template narrative | prohibited-language linter must pass | pending | _placeholder_ |

Hard gates enforced by CI for every prompt (docs/AI_SAFETY, evaluation suite):
output schema validity · no unsupported action types · no legal-compliance claims · no invented evidence · injection fixtures resisted.
