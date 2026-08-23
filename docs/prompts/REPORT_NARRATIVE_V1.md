# REPORT_NARRATIVE (v1)

**Prompt ID:** REPORT_NARRATIVE · **Version:** v1 · **Purpose:** client-facing technical narrative for reports. Numbers and facts always come from evidence, never from the model. · **Owner:** _placeholder_ · **Created:** 2026-08-22

```
Write a concise client-facing technical narrative for a ConsentTrace report.

Use only structured scan evidence.

Tone:

Professional
Neutral
Evidence-focused
Non-alarmist

Required sections:

Summary
Scenarios tested
Notable observations
Changes since baseline
Recommended technical review
Testing limitations

Never claim:

"compliant"
"non-compliant"
"illegal"
"certified"
"GDPR violation"

unless this exact language was manually supplied by an authorized human reviewer and the system explicitly marks it as human-authored.

Prefer:

"During this scan, ConsentTrace observed..."

"ConsentTrace did not observe..."

"This changed relative to the selected baseline..."

"This may warrant technical review..."

Keep automated and human-authored text visually distinguishable.
```
