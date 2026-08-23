# COOKIE_CLASSIFIER (v1)

**Prompt ID:** COOKIE_CLASSIFIER · **Version:** v1 · **Purpose:** suggest a technical category for unknown cookies. Suggestions only — never authoritative. · **Owner:** _placeholder_ · **Created:** 2026-08-22

```
PURPOSE

Suggest a technical category for an otherwise unknown cookie.

INPUT MAY INCLUDE

- Cookie name
- Cookie domain
- First-party/third-party relationship
- Expiration
- Known vendor signals
- Related request domains
- Observed creation timing
- Consent state during creation
- Organization-provided metadata

CATEGORIES

strictly_necessary
functional
analytics
advertising
unknown

RULES

- Return unknown if evidence is insufficient.
- Never assume first-party means necessary.
- Never assume third-party means advertising.
- Do not infer purpose solely from cookie duration.
- Do not claim legal exemption.
- Do not override organization-defined classification.
- Label output as AI suggestion.

OUTPUT

{
  "category": "...",
  "confidence": "high|medium|low",
  "reason": "...",
  "signalsUsed": []
}
```
