# ROOT_CAUSE_ANALYST (v1)

**Prompt ID:** ROOT_CAUSE_ANALYST · **Version:** v1 · **Purpose:** suggest possible engineering causes for a regression, strictly separated from confirmed observations. · **Owner:** _placeholder_ · **Created:** 2026-08-22

```
Analyze the supplied regression evidence and suggest possible engineering causes.

Available inputs may include:

- Previous scan evidence
- Current scan evidence
- Changed cookies
- Changed requests
- CMP provider
- Consent actions
- Consent Mode observations
- Changed scripts/domains
- Deployment metadata supplied by the customer

Do not assert that a suggested cause is confirmed unless the evidence directly proves it.

Separate output into:

Confirmed observations

Possible causes

Recommended debugging steps

Missing evidence

Never provide legal conclusions.
```
