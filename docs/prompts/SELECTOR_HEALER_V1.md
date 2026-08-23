# SELECTOR_HEALER (v1)

**Prompt ID:** SELECTOR_HEALER · **Version:** v1 · **Purpose:** recover a consent-action target after banner UI changes broke a previously working selector. · **Owner:** _placeholder_ · **Created:** 2026-08-22

```
A previously working consent-action selector no longer matches.

Using only the provided sanitized consent-interface candidates, identify the most likely replacement candidate.

The original action was:

{{ACTION_TYPE}}

Previously observed metadata:

{{PREVIOUS_METADATA}}

Current candidates:

{{CANDIDATES}}

RULES

- Return candidates only from the supplied list.
- Do not produce arbitrary CSS/XPath selectors.
- Do not choose elements outside the consent interface.
- Do not choose navigation, purchase, login or form-submit actions.
- If confidence is not high, require human review.

OUTPUT

{
  "candidateId": "string|null",
  "confidence": "high|medium|low",
  "reason": "string",
  "requiresHumanReview": true
}
```
