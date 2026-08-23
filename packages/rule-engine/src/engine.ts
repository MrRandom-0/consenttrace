/**
 * Deterministic rule engine. The browser recorder is the source of facts;
 * rules interpret facts. AI never decides pass/fail for these rules.
 */
import type { RuleResult, ScanResult, ScenarioResult, ScenarioType, Severity } from '@consenttrace/shared';
import { cookieKey, trackingDomains } from '@consenttrace/scanner-core';

export interface BaselineSummary {
  scanId: string;
  createdAt: string;
  /** All cookie keys (name|domain|path) observed anywhere in the baseline scan. */
  cookieKeys: string[];
  /** All third-party request domains observed in the baseline scan. */
  thirdPartyDomains: string[];
  /** Whether tracking (cookie or request) was observed pre-consent in the baseline no-action scenario. */
  noActionTracking: boolean;
  /** Whether a reject action was found in the baseline. */
  rejectActionFound: boolean;
}

export interface RuleContext {
  scenarios: Partial<Record<ScenarioType, ScenarioResult>>;
  baseline?: BaselineSummary;
}

export interface ConsentRule {
  id: string;
  version: string;
  name: string;
  description: string;
  severity: Severity;
  evaluate(ctx: RuleContext): RuleResult | RuleResult[];
}

const TRACKING_CATEGORIES = new Set(['analytics', 'advertising']);

function trackingCookies(s: ScenarioResult, phases: Array<keyof ScenarioResult['cookies']>) {
  const seen = new Map<string, NonNullable<ScenarioResult['cookies']['after_settle']>[number]>();
  for (const phase of phases) {
    for (const c of s.cookies[phase] ?? []) {
      if (TRACKING_CATEGORIES.has(c.category)) seen.set(cookieKey(c), c);
    }
  }
  return [...seen.values()];
}

function evidenceFor(s: ScenarioResult, labels: string[]): string[] {
  const ids: string[] = [];
  for (const label of labels) {
    const fromRefs = s.evidenceRefs[label];
    if (fromRefs) ids.push(fromRefs);
    const fromShots = s.screenshots[label];
    if (fromShots) ids.push(fromShots);
  }
  return [...new Set(ids)];
}

function result(
  rule: ConsentRule,
  partial: Partial<RuleResult> & Pick<RuleResult, 'status' | 'observation'>,
): RuleResult {
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    name: rule.name,
    severity: rule.severity,
    scenario: null,
    title: rule.name,
    expectedBehavior: '',
    actualBehavior: '',
    evidenceIds: [],
    regression: false,
    metadata: {},
    ...partial,
  };
}

function na(rule: ConsentRule, why: string): RuleResult {
  return result(rule, { status: 'not_applicable', observation: why });
}

export const CT_001: ConsentRule = {
  id: 'CT-001',
  version: '1.0.0',
  name: 'Potential non-essential storage before choice',
  description: 'A cookie classified as advertising or analytics appears in the no-action scenario before any consent choice.',
  severity: 'high',
  evaluate(ctx) {
    const s = ctx.scenarios.no_action;
    if (!s || s.status === 'failed') return na(this, 'No-action scenario was not completed.');
    const offenders = trackingCookies(s, ['after_page_load', 'after_settle']);
    if (offenders.length === 0) {
      return result(this, {
        status: 'pass',
        scenario: 'no_action',
        observation: 'No cookies classified as analytics or advertising were observed before a consent choice during this test.',
      });
    }
    return result(this, {
      status: 'finding',
      scenario: 'no_action',
      observation: `${offenders.length} cookie(s) classified as analytics/advertising were observed before any consent choice: ${offenders.map((c) => `${c.name} (${c.category}${c.vendor ? ', ' + c.vendor : ''})`).join(', ')}.`,
      expectedBehavior: 'No analytics or advertising storage before the visitor makes a consent choice.',
      actualBehavior: `Observed pre-choice: ${offenders.map((c) => c.name).join(', ')}.`,
      evidenceIds: evidenceFor(s, ['cookies_after_settle', 'cookies_after_page_load', 'banner_visible', 'network_log']),
      metadata: { cookies: offenders.map((c) => ({ name: c.name, domain: c.domain, category: c.category, vendor: c.vendor })) },
    });
  },
};

export const CT_002: ConsentRule = {
  id: 'CT-002',
  version: '1.0.0',
  name: 'Rejected state still creates optional storage',
  description: 'After a reject action, cookies classified as analytics or advertising are still present.',
  severity: 'high',
  evaluate(ctx) {
    const s = ctx.scenarios.reject_all;
    if (!s || s.status === 'failed') return na(this, 'Reject-all scenario was not completed.');
    if (!s.consentAction) return na(this, 'No reject action was performed (see CT-004).');
    const offenders = trackingCookies(s, ['after_settle', 'after_reload']);
    if (offenders.length === 0) {
      return result(this, {
        status: 'pass',
        scenario: 'reject_all',
        observation: 'No analytics or advertising cookies were observed after the reject action during this test.',
      });
    }
    return result(this, {
      status: 'finding',
      scenario: 'reject_all',
      observation: `${offenders.length} cookie(s) classified as analytics/advertising were present after the reject action: ${offenders.map((c) => `${c.name} (${c.category}${c.vendor ? ', ' + c.vendor : ''})`).join(', ')}.`,
      expectedBehavior: 'Rejecting consent prevents (or removes) analytics and advertising storage.',
      actualBehavior: `Present after rejection: ${offenders.map((c) => c.name).join(', ')}.`,
      evidenceIds: evidenceFor(s, ['cookies_after_settle', 'cookies_after_reload', 'reject_after_click', 'network_log']),
      metadata: { cookies: offenders.map((c) => ({ name: c.name, domain: c.domain, category: c.category, vendor: c.vendor })) },
    });
  },
};

export const CT_003: ConsentRule = {
  id: 'CT-003',
  version: '1.0.0',
  name: 'Advertising request observed after Reject All',
  description: 'A request to a domain classified as advertising occurred after the reject action.',
  severity: 'high',
  evaluate(ctx) {
    const s = ctx.scenarios.reject_all;
    if (!s || s.status === 'failed') return na(this, 'Reject-all scenario was not completed.');
    if (!s.consentAction) return na(this, 'No reject action was performed (see CT-004).');
    const after = s.network.filter((n) => n.atMs > s.consentAction!.atMs && n.requestCategory === 'advertising');
    if (after.length === 0) {
      return result(this, {
        status: 'pass',
        scenario: 'reject_all',
        observation: 'No requests to advertising-classified domains were observed after the reject action during this test.',
      });
    }
    const first = after[0]!;
    return result(this, {
      status: 'finding',
      scenario: 'reject_all',
      observation: `${after.length} request(s) to advertising-classified domains were observed after the reject action. First: ${first.domain} at +${first.atMs - s.consentAction!.atMs} ms after rejection.`,
      expectedBehavior: 'No advertising requests after consent is rejected.',
      actualBehavior: `Domains contacted: ${[...new Set(after.map((n) => n.domain))].join(', ')}.`,
      evidenceIds: evidenceFor(s, ['network_log', 'reject_after_click', 'timeline']),
      metadata: { requests: after.map((n) => ({ domain: n.domain, url: n.urlNormalized, atMs: n.atMs, vendor: n.vendor })) },
    });
  },
};

export const CT_004: ConsentRule = {
  id: 'CT-004',
  version: '1.0.0',
  name: 'Reject action not detected',
  description: 'A consent interface was detected but no reject-style action could be found.',
  severity: 'medium',
  evaluate(ctx) {
    const s = ctx.scenarios.reject_all;
    if (!s) return na(this, 'Reject-all scenario was not run.');
    if (!s.cmp.detected) return na(this, 'No consent interface was detected (see CT-005).');
    if (s.consentAction) {
      return result(this, {
        status: 'pass',
        scenario: 'reject_all',
        observation: `A reject action ("${s.consentAction.buttonText}") was detected and used during this test.`,
      });
    }
    return result(this, {
      status: 'finding',
      scenario: 'reject_all',
      observation: 'A consent interface was detected, but no reject-style action was found among its controls. This is a technical observation; preference-center flows may still offer rejection.',
      expectedBehavior: 'A reject or equivalent action is available in the consent interface.',
      actualBehavior: 'reject_action_not_found',
      evidenceIds: evidenceFor(s, ['banner_visible', 'consent_ui']),
      metadata: { structuredObservation: 'reject_action_not_found', candidateCount: s.cmp.candidateCount ?? 0 },
    });
  },
};

export const CT_005: ConsentRule = {
  id: 'CT-005',
  version: '1.0.0',
  name: 'Consent banner not detected',
  description: 'No consent interface was detected in any scenario.',
  severity: 'low',
  evaluate(ctx) {
    const scenarios = Object.values(ctx.scenarios).filter(Boolean) as ScenarioResult[];
    if (scenarios.length === 0) return na(this, 'No scenarios were completed.');
    const anyDetected = scenarios.some((s) => s.cmp.detected);
    if (anyDetected) {
      const detected = scenarios.find((s) => s.cmp.detected)!;
      return result(this, {
        status: 'pass',
        observation: `A consent interface was detected${detected.cmp.provider ? ` (${detected.cmp.provider})` : ''} during this test.`,
      });
    }
    return result(this, {
      status: 'finding',
      observation: 'No consent banner or CMP was detected in any scenario. This may be expected for sites without optional storage; it requires review if tracking technologies are in use.',
      expectedBehavior: 'A consent interface is detectable when optional storage/tracking is used.',
      actualBehavior: 'No consent interface detected.',
      evidenceIds: evidenceFor(scenarios[0]!, ['initial_page', 'banner_visible']),
    });
  },
};

export const CT_006: ConsentRule = {
  id: 'CT-006',
  version: '1.0.0',
  name: 'Accept and reject produce identical tracking behavior',
  description: 'The accept flow and reject flow produced the same non-empty tracking behavior.',
  severity: 'high',
  evaluate(ctx) {
    const accept = ctx.scenarios.accept_all;
    const reject = ctx.scenarios.reject_all;
    if (!accept?.consentAction || !reject?.consentAction) {
      return na(this, 'Both accept and reject actions must have been performed to compare.');
    }
    const acceptSig = {
      domains: trackingDomains(accept.network.filter((n) => n.atMs > accept.consentAction!.atMs)),
      cookies: trackingCookies(accept, ['after_settle']).map((c) => c.name).sort(),
    };
    const rejectSig = {
      domains: trackingDomains(reject.network.filter((n) => n.atMs > reject.consentAction!.atMs)),
      cookies: trackingCookies(reject, ['after_settle']).map((c) => c.name).sort(),
    };
    const identical =
      JSON.stringify(acceptSig) === JSON.stringify(rejectSig) &&
      (acceptSig.domains.length > 0 || acceptSig.cookies.length > 0);
    if (!identical) {
      return result(this, {
        status: 'pass',
        observation: 'Accept and reject flows produced different tracking behavior during this test (expected).',
        metadata: { acceptSig, rejectSig },
      });
    }
    return result(this, {
      status: 'finding',
      observation: `Accept and reject flows produced identical tracking behavior: cookies [${acceptSig.cookies.join(', ')}], domains [${acceptSig.domains.join(', ')}]. The reject action may not be wired to tag behavior.`,
      expectedBehavior: 'Rejecting consent results in less tracking activity than accepting.',
      actualBehavior: 'Identical tracking cookies/domains in both flows.',
      evidenceIds: [...evidenceFor(reject, ['network_log', 'cookies_after_settle']), ...evidenceFor(accept, ['network_log', 'cookies_after_settle'])],
      metadata: { acceptSig, rejectSig },
    });
  },
};

export const CT_007: ConsentRule = {
  id: 'CT-007',
  version: '1.0.0',
  name: 'Consent preference not preserved after reload',
  description: 'After a consent action and reload, the consent banner was shown again.',
  severity: 'medium',
  evaluate(ctx) {
    const results: RuleResult[] = [];
    for (const scenario of ['reject_all', 'accept_all'] as const) {
      const s = ctx.scenarios[scenario];
      if (!s?.consentAction || s.bannerAfterReload === null) continue;
      if (s.bannerAfterReload) {
        results.push(
          result(this, {
            status: 'finding',
            scenario,
            observation: `After the ${scenario === 'reject_all' ? 'reject' : 'accept'} action and a reload, the consent banner was displayed again, indicating the preference may not persist.`,
            expectedBehavior: 'The consent choice persists across reloads and the banner is not shown again.',
            actualBehavior: 'Banner visible again after reload.',
            evidenceIds: evidenceFor(s, ['after_reload', 'cookies_after_reload']),
          }),
        );
      } else {
        results.push(
          result(this, {
            status: 'pass',
            scenario,
            observation: `The ${scenario === 'reject_all' ? 'reject' : 'accept'} preference persisted after reload during this test (banner not shown again).`,
          }),
        );
      }
    }
    if (results.length === 0) return na(this, 'No scenario with a completed consent action and reload check.');
    return results;
  },
};

function currentCookieKeys(ctx: RuleContext): Set<string> {
  const keys = new Set<string>();
  for (const s of Object.values(ctx.scenarios)) {
    if (!s) continue;
    for (const phase of Object.keys(s.cookies) as Array<keyof ScenarioResult['cookies']>) {
      for (const c of s.cookies[phase] ?? []) keys.add(cookieKey(c));
    }
  }
  return keys;
}

function currentThirdPartyDomains(ctx: RuleContext): Set<string> {
  const domains = new Set<string>();
  for (const s of Object.values(ctx.scenarios)) {
    if (!s) continue;
    for (const n of s.network) if (n.thirdParty) domains.add(n.domain);
  }
  return domains;
}

export const CT_008: ConsentRule = {
  id: 'CT-008',
  version: '1.0.0',
  name: 'New cookie introduced since baseline',
  description: 'A cookie not present in the baseline scan was observed.',
  severity: 'info',
  evaluate(ctx) {
    if (!ctx.baseline) return na(this, 'No baseline selected for comparison.');
    const baselineKeys = new Set(ctx.baseline.cookieKeys);
    const added = [...currentCookieKeys(ctx)].filter((k) => !baselineKeys.has(k));
    if (added.length === 0) {
      return result(this, { status: 'pass', observation: 'No new cookies relative to the selected baseline.' });
    }
    return result(this, {
      status: 'finding',
      regression: true,
      observation: `${added.length} cookie(s) observed that were not present in baseline ${ctx.baseline.scanId}: ${added.map((k) => k.split('|')[0]).join(', ')}.`,
      expectedBehavior: 'Cookie inventory matches the selected baseline.',
      actualBehavior: `New cookie keys: ${added.join('; ')}.`,
      metadata: { addedCookieKeys: added, baselineScanId: ctx.baseline.scanId },
    });
  },
};

export const CT_009: ConsentRule = {
  id: 'CT-009',
  version: '1.0.0',
  name: 'New third-party domain introduced since baseline',
  description: 'A third-party request domain not present in the baseline scan was observed.',
  severity: 'medium',
  evaluate(ctx) {
    if (!ctx.baseline) return na(this, 'No baseline selected for comparison.');
    const baselineDomains = new Set(ctx.baseline.thirdPartyDomains);
    const added = [...currentThirdPartyDomains(ctx)].filter((d) => !baselineDomains.has(d));
    if (added.length === 0) {
      return result(this, { status: 'pass', observation: 'No new third-party domains relative to the selected baseline.' });
    }
    return result(this, {
      status: 'finding',
      regression: true,
      observation: `${added.length} third-party domain(s) observed that were not present in baseline ${ctx.baseline.scanId}: ${added.join(', ')}.`,
      expectedBehavior: 'Third-party request domains match the selected baseline.',
      actualBehavior: `New domains: ${added.join(', ')}.`,
      metadata: { addedDomains: added, baselineScanId: ctx.baseline.scanId },
    });
  },
};

export const CT_010: ConsentRule = {
  id: 'CT-010',
  version: '1.0.0',
  name: 'Previously clean pre-consent state now shows tracking',
  description: 'The baseline no-action scenario showed no tracking before consent; the current scan does.',
  severity: 'high',
  evaluate(ctx) {
    if (!ctx.baseline) return na(this, 'No baseline selected for comparison.');
    const s = ctx.scenarios.no_action;
    if (!s || s.status === 'failed') return na(this, 'No-action scenario was not completed.');
    const cookiesNow = trackingCookies(s, ['after_page_load', 'after_settle']);
    const requestsNow = s.network.filter((n) => n.requestCategory === 'advertising' || n.requestCategory === 'analytics');
    const trackingNow = cookiesNow.length > 0 || requestsNow.length > 0;
    if (ctx.baseline.noActionTracking) {
      return na(this, 'Baseline already showed pre-consent tracking; CT-001 covers the current state.');
    }
    if (!trackingNow) {
      return result(this, {
        status: 'pass',
        scenario: 'no_action',
        observation: 'Pre-consent state remains free of observed tracking, matching the baseline.',
      });
    }
    return result(this, {
      status: 'finding',
      regression: true,
      scenario: 'no_action',
      observation: `REGRESSION: baseline scan ${ctx.baseline.scanId} observed no tracking before consent; this scan observed ${cookiesNow.length} tracking cookie(s) [${cookiesNow.map((c) => c.name).join(', ')}] and ${requestsNow.length} tracking request(s) [${[...new Set(requestsNow.map((r) => r.domain))].join(', ')}] before any consent choice.`,
      expectedBehavior: 'Pre-consent state stays free of tracking, as in the baseline.',
      actualBehavior: 'Tracking observed before consent choice.',
      evidenceIds: evidenceFor(s, ['cookies_after_settle', 'network_log', 'banner_visible', 'timeline']),
      metadata: {
        cookies: cookiesNow.map((c) => c.name),
        domains: [...new Set(requestsNow.map((r) => r.domain))],
        baselineScanId: ctx.baseline.scanId,
      },
    });
  },
};

export const DEFAULT_RULES: ConsentRule[] = [CT_001, CT_002, CT_003, CT_004, CT_005, CT_006, CT_007, CT_008, CT_009, CT_010];

export function evaluateRules(ctx: RuleContext, rules: ConsentRule[] = DEFAULT_RULES): RuleResult[] {
  const results: RuleResult[] = [];
  for (const rule of rules) {
    try {
      const r = rule.evaluate(ctx);
      results.push(...(Array.isArray(r) ? r : [r]));
    } catch (err) {
      results.push({
        ruleId: rule.id,
        ruleVersion: rule.version,
        name: rule.name,
        severity: rule.severity,
        status: 'error',
        scenario: null,
        title: rule.name,
        observation: `Rule evaluation failed: ${(err as Error).message}`,
        expectedBehavior: '',
        actualBehavior: '',
        evidenceIds: [],
        regression: false,
        metadata: {},
      });
    }
  }
  return results;
}

/** Build a BaselineSummary from a previously stored ScanResult. */
export function summarizeBaseline(scan: ScanResult): BaselineSummary {
  const cookieKeys = new Set<string>();
  const thirdPartyDomains = new Set<string>();
  let noActionTracking = false;
  let rejectActionFound = false;
  for (const s of scan.scenarios) {
    for (const phase of Object.keys(s.cookies) as Array<keyof ScenarioResult['cookies']>) {
      for (const c of s.cookies[phase] ?? []) cookieKeys.add(cookieKey(c));
    }
    for (const n of s.network) if (n.thirdParty) thirdPartyDomains.add(n.domain);
    if (s.scenario === 'no_action') {
      const cookies = [...(s.cookies.after_page_load ?? []), ...(s.cookies.after_settle ?? [])];
      noActionTracking =
        cookies.some((c) => TRACKING_CATEGORIES.has(c.category)) ||
        s.network.some((n) => n.requestCategory === 'advertising' || n.requestCategory === 'analytics');
    }
    if (s.scenario === 'reject_all' && s.consentAction) rejectActionFound = true;
  }
  return {
    scanId: scan.scanId,
    createdAt: scan.completedAt,
    cookieKeys: [...cookieKeys].sort(),
    thirdPartyDomains: [...thirdPartyDomains].sort(),
    noActionTracking,
    rejectActionFound,
  };
}
