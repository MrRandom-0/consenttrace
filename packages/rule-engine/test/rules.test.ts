import { describe, expect, it } from 'vitest';
import type { CookieObservation, NetworkObservation, ScanResult, ScenarioResult } from '@consenttrace/shared';
import { CT_001, CT_002, CT_003, CT_004, CT_006, CT_007, evaluateRules, summarizeBaseline, type RuleContext } from '@consenttrace/rule-engine';

function cookie(name: string, category: CookieObservation['category'], phase: CookieObservation['phase']): CookieObservation {
  return {
    name, domain: 'site.example.com', path: '/', valueHash: 'sha256:x', secure: false, httpOnly: false,
    sameSite: 'Lax', session: false, expiresAt: null, firstParty: true, category,
    classificationSource: category === 'unknown' ? 'unclassified' : 'known_signature',
    vendor: null, phase, capturedAt: new Date().toISOString(),
  };
}

function request(domain: string, category: NetworkObservation['requestCategory'], atMs: number): NetworkObservation {
  return {
    urlNormalized: `http://${domain}/x`, domain, method: 'GET', resourceType: 'image', atMs,
    timestamp: new Date().toISOString(), requestCategory: category, vendor: null, thirdParty: true, blocked: false, status: 200,
  };
}

function scenario(type: ScenarioResult['scenario'], overrides: Partial<ScenarioResult> = {}): ScenarioResult {
  return {
    scenario: type, status: 'completed', startedAt: new Date().toISOString(), durationMs: 1000,
    cmp: { detected: true, confidence: 0.9, evidence: [] }, consentAction: null, observations: [],
    cookies: {}, storage: {}, network: [], bannerAfterReload: null, screenshots: {}, evidenceRefs: {},
    timeline: [], failureCode: null, ...overrides,
  };
}

const action = (type: 'accept_all' | 'reject_all', atMs: number) => ({
  type, buttonText: type === 'accept_all' ? 'Accept all' : 'Reject all',
  selectorStrategy: 'deterministic_text_match' as const, elementRole: 'button',
  interactionAt: new Date().toISOString(), atMs, confidence: 'high' as const,
  screenshotBeforeEvidenceId: null, screenshotAfterEvidenceId: null,
});

describe('CT-001 pre-consent storage', () => {
  it('fires when advertising cookies appear before choice', () => {
    const ctx: RuleContext = { scenarios: { no_action: scenario('no_action', { cookies: { after_settle: [cookie('_fbp', 'advertising', 'after_settle')] } }) } };
    const r = CT_001.evaluate(ctx);
    expect(r).toMatchObject({ status: 'finding', severity: 'high' });
  });
  it('passes when only necessary/unknown cookies exist pre-choice', () => {
    const ctx: RuleContext = {
      scenarios: { no_action: scenario('no_action', { cookies: { after_settle: [cookie('session_id', 'strictly_necessary', 'after_settle'), cookie('mystery', 'unknown', 'after_settle')] } }) },
    };
    expect(CT_001.evaluate(ctx)).toMatchObject({ status: 'pass' });
  });
});

describe('CT-002 / CT-003 reject behavior', () => {
  it('CT-002 fires when analytics cookies persist after reject', () => {
    const s = scenario('reject_all', { consentAction: action('reject_all', 2000), cookies: { after_settle: [cookie('_ga', 'analytics', 'after_settle')] } });
    expect(CT_002.evaluate({ scenarios: { reject_all: s } })).toMatchObject({ status: 'finding' });
  });
  it('CT-003 fires only for advertising requests AFTER the reject click', () => {
    const s = scenario('reject_all', {
      consentAction: action('reject_all', 2000),
      network: [request('ads.example', 'advertising', 1500), request('ads.example', 'advertising', 2600)],
    });
    const r = CT_003.evaluate({ scenarios: { reject_all: s } });
    expect(r).toMatchObject({ status: 'finding' });
    const clean = scenario('reject_all', { consentAction: action('reject_all', 2000), network: [request('ads.example', 'advertising', 1500)] });
    expect(CT_003.evaluate({ scenarios: { reject_all: clean } })).toMatchObject({ status: 'pass' });
  });
  it('CT-002/003 are not applicable when no reject action was performed', () => {
    const s = scenario('reject_all', { cookies: { after_settle: [cookie('_ga', 'analytics', 'after_settle')] } });
    expect(CT_002.evaluate({ scenarios: { reject_all: s } })).toMatchObject({ status: 'not_applicable' });
  });
});

describe('CT-004 reject action detection', () => {
  it('fires when a CMP is detected but no reject action exists', () => {
    const s = scenario('reject_all', { observations: ['reject_action_not_found'] });
    expect(CT_004.evaluate({ scenarios: { reject_all: s } })).toMatchObject({ status: 'finding', severity: 'medium' });
  });
  it('passes when the reject action was used', () => {
    const s = scenario('reject_all', { consentAction: action('reject_all', 1000) });
    expect(CT_004.evaluate({ scenarios: { reject_all: s } })).toMatchObject({ status: 'pass' });
  });
});

describe('CT-006 identical accept/reject behavior', () => {
  it('fires when both flows show identical non-empty tracking', () => {
    const acceptScenario = scenario('accept_all', {
      consentAction: action('accept_all', 1000),
      cookies: { after_settle: [cookie('_ga', 'analytics', 'after_settle')] },
      network: [request('tracker.example', 'analytics', 1500)],
    });
    const rejectScenario = scenario('reject_all', {
      consentAction: action('reject_all', 1000),
      cookies: { after_settle: [cookie('_ga', 'analytics', 'after_settle')] },
      network: [request('tracker.example', 'analytics', 1500)],
    });
    expect(CT_006.evaluate({ scenarios: { accept_all: acceptScenario, reject_all: rejectScenario } })).toMatchObject({ status: 'finding' });
  });
});

describe('CT-007 persistence', () => {
  it('fires when banner reappears after reload', () => {
    const s = scenario('reject_all', { consentAction: action('reject_all', 1000), bannerAfterReload: true });
    const results = CT_007.evaluate({ scenarios: { reject_all: s } });
    expect(Array.isArray(results) ? results[0] : results).toMatchObject({ status: 'finding' });
  });
});

describe('baseline regression rules CT-008/009/010', () => {
  const baselineScan: ScanResult = {
    scanId: 'scan_baseline', url: 'http://site.example.com/', finalUrl: null, triggerType: 'manual_cloud',
    status: 'completed', startedAt: '', completedAt: '', scannerVersion: '0.1.0', rulePackVersion: 'x',
    browser: { name: 'chromium', version: '1' }, viewport: { width: 1, height: 1 }, locale: 'en',
    timezoneId: null, regionProfile: null, baselineScanId: null, failureCode: null, failureMessage: null,
    evidence: null, findings: [],
    scenarios: [scenario('no_action', { cookies: { after_settle: [cookie('session_id', 'strictly_necessary', 'after_settle')] } })],
  };

  it('summarizes a clean baseline', () => {
    const b = summarizeBaseline(baselineScan);
    expect(b.noActionTracking).toBe(false);
    expect(b.cookieKeys).toContain('session_id|site.example.com|/');
  });

  it('flags new cookies, new domains and new pre-consent tracking as regressions', () => {
    const baseline = summarizeBaseline(baselineScan);
    const current: RuleContext = {
      baseline,
      scenarios: {
        no_action: scenario('no_action', {
          cookies: { after_settle: [cookie('session_id', 'strictly_necessary', 'after_settle'), cookie('_fbp', 'advertising', 'after_settle')] },
          network: [request('cdn.fxtracker.example', 'advertising', 900)],
        }),
      },
    };
    const results = evaluateRules(current);
    const byId = Object.fromEntries(results.map((r) => [r.ruleId + ':' + r.status, r]));
    expect(byId['CT-008:finding']).toMatchObject({ regression: true });
    expect(byId['CT-009:finding']).toMatchObject({ regression: true });
    expect(byId['CT-010:finding']).toMatchObject({ regression: true, severity: 'high' });
  });

  it('CT-008..010 are not applicable without a baseline', () => {
    const results = evaluateRules({ scenarios: { no_action: scenario('no_action') } });
    for (const id of ['CT-008', 'CT-009', 'CT-010']) {
      expect(results.find((r) => r.ruleId === id)?.status).toBe('not_applicable');
    }
  });
});
