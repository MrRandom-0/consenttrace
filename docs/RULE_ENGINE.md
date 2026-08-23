# Rule Engine

**Purpose:** deterministic interpretation of scan evidence. **Scope:** `packages/rule-engine`. **Owner:** _placeholder_. **Last reviewed:** 2026-08-22.

## Philosophy

The browser recorder is the source of **facts**. Rules interpret facts, deterministically and reproducibly: the same evidence always yields the same results. AI may explain a rule result; it can never decide, alter, or override one. Rule output language is observational (“observed”, “not observed during this test”) — never legal conclusions.

## Rule schema

```ts
interface ConsentRule {
  id: string;            // CT-001…
  version: string;       // semver per rule
  name: string;
  description: string;
  severity: Severity;    // info | low | medium | high | critical
  evaluate(ctx: RuleContext): RuleResult | RuleResult[];
}
```

Every `RuleResult` carries: status (`pass` / `finding` / `not_applicable` / `error`), observation (facts), expected vs actual behavior, **evidence IDs**, regression flag, and metadata. A rule that throws produces an `error` result — never a silent pass.

## Default rule pack (version `2026.08.0`)

| ID | Severity | Trigger |
| --- | --- | --- |
| CT-001 | high | Analytics/advertising cookie observed in no-action scenario before any choice |
| CT-002 | high | Analytics/advertising cookies present after a performed reject action |
| CT-003 | high | Request to advertising-classified domain after the reject click |
| CT-004 | medium | CMP detected but no reject-style action found (`reject_action_not_found`) |
| CT-005 | low | No consent interface detected in any scenario (needs review) |
| CT-006 | high | Accept and reject flows produce identical non-empty tracking behavior |
| CT-007 | medium | Banner shown again after reload following a consent action |
| CT-008 | info | New cookie vs baseline (regression) |
| CT-009 | medium | New third-party domain vs baseline (regression) |
| CT-010 | high | Baseline pre-consent state was clean; current scan shows pre-consent tracking (regression) |
| CT-011 | high | Previously available Reject All control disappeared *(Phase 2 — needs baseline action inventory)* |
| CT-012 | medium | Consent Mode default/update behavior changed *(Phase 2 — needs Consent Mode analyzer)* |

Notes:
- `unknown` cookies **never** trigger tracking rules — classification uncertainty is surfaced, not punished.
- CT-002/003/006 require a *performed* consent action; otherwise `not_applicable` (CT-004 covers the missing action).

## Classification knowledge bases

- `signatures/cookies.ts` (version `2026.08.0`): pattern + optional domain gate + vendor + category + confidence. Priority: **organization override → known signature → unknown/unclassified**.
- `signatures/domains.ts`: suffix-matched request domains; longest suffix wins; same override priority.
- Overrides are per-organization data (`cookie_overrides`, `domain_overrides` tables) and always beat suggestions. AI-suggested classifications (Phase 2) are labeled `ai_suggested` and are never authoritative.

## Profiles

Rule profiles (technical baseline, UK-oriented, France-oriented, custom) are **technical testing presets**, never labeled “GDPR compliant” / “ICO certified” / “CNIL approved”. Each rule-pack release records `rule_pack_version`, `last_reviewed_at`, `review_notes` (see `rule_packs` table).

## Versioning & updates

Rules and KBs are versioned; scans record the rule-pack version used, so historical findings stay interpretable. Changing a rule requires: version bump, fixture-backed tests, CHANGELOG entry.

## Testing

`packages/rule-engine/test/`: per-rule synthetic contexts (fires/passes/not-applicable), override priority, domain gating, baseline summarization, regression flags. E2E fixtures exercise CT-001…CT-004 and CT-008…CT-010 against real browser evidence.

## Legal disclaimer

Rule results are technical evaluations of browser observations under one test configuration. They are not legal advice, compliance determinations, or certifications.

## Future

CT-011/012 once baseline action inventory + Consent Mode analyzer land; per-organization severity overrides (schema exists); configurable rule parameters (e.g. settle-window sensitivity).
