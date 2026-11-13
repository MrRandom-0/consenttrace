import { describe, expect, it } from 'vitest';
import type { CookieObservation, NetworkObservation, RuleResult, ScanResult, ScenarioResult } from '@consenttrace/shared';
import { compareScanResults } from '@consenttrace/scanner-core';

function cookie(name: string, overrides: Partial<CookieObservation> = {}): CookieObservation {
  return {
    name, domain: 'site.example.com', path: '/', valueHash: 'sha256:x', secure: false, httpOnly: false,
    sameSite: 'Lax', session: false, expiresAt: null, firstParty: true, category: 'analytics',
    classificationSource: 'known_signature', vendor: null, phase: 'after_settle',
    capturedAt: new Date().toISOString(), ...overrides,
  };
}

function request(domain: string, category: NetworkObservation['requestCategory']): NetworkObservation {
  return {
    urlNormalized: `https://${domain}/x`, domain, method: 'GET', resourceType: 'script', atMs: 100,
    timestamp: new Date().toISOString(), requestCategory: category, vendor: null, thirdParty: true,
    blocked: false, status: 200,
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

function finding(ruleId: string, scenarioType: RuleResult['scenario'], status: RuleResult['status'] = 'finding'): RuleResult {
  return {
    ruleId, ruleVersion: '1', name: ruleId, severity: 'high', status, scenario: scenarioType,
    title: ruleId, observation: 'observed', expectedBehavior: '', actualBehavior: '',
    evidenceIds: [], regression: false, metadata: {},
  };
}

function scan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    scanId: 'scan-1', url: 'https://site.example.com', finalUrl: null, triggerType: 'manual_cloud',
    status: 'completed', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(),
    scannerVersion: '1', rulePackVersion: '1', browser: { name: 'chromium', version: '1' },
    viewport: { width: 1280, height: 800 }, locale: 'en-US', timezoneId: null, regionProfile: null,
    scenarios: [], findings: [], evidence: null, baselineScanId: null, failureCode: null,
    failureMessage: null, ...overrides,
  };
}

describe('compareScanResults', () => {
  it('reports added, removed and changed cookies per scenario', () => {
    const before = scan({
      scenarios: [scenario('reject_all', {
        cookies: { after_settle: [cookie('_ga'), cookie('legacy', { valueHash: 'sha256:a' })] },
      })],
    });
    const after = scan({
      scenarios: [scenario('reject_all', {
        cookies: { after_settle: [cookie('_fbp', { category: 'advertising' }), cookie('legacy', { valueHash: 'sha256:b' })] },
      })],
    });
    const cmp = compareScanResults(before, after);
    expect(cmp.scenarios).toHaveLength(1);
    const sc = cmp.scenarios[0]!;
    expect(sc.cookies.added.map((c) => c.name)).toEqual(['_fbp']);
    expect(sc.cookies.removed.map((c) => c.name)).toEqual(['_ga']);
    expect(sc.cookies.changed).toHaveLength(1);
    expect(sc.cookies.changed[0]!.changedFields).toContain('value');
    expect(cmp.summary).toMatchObject({ cookiesAdded: 1, cookiesRemoved: 1, cookiesChanged: 1 });
  });

  it('falls back to after_page_load snapshots when after_settle is absent', () => {
    const before = scan({ scenarios: [scenario('no_action', { cookies: { after_page_load: [cookie('a')] } })] });
    const after = scan({ scenarios: [scenario('no_action', { cookies: { after_page_load: [cookie('a'), cookie('b')] } })] });
    const cmp = compareScanResults(before, after);
    expect(cmp.scenarios[0]!.cookies.added.map((c) => c.name)).toEqual(['b']);
  });

  it('diffs all domains and the tracking subset separately', () => {
    const before = scan({
      scenarios: [scenario('accept_all', {
        network: [request('cdn.example.com', 'functional'), request('old-ads.example.com', 'advertising')],
      })],
    });
    const after = scan({
      scenarios: [scenario('accept_all', {
        network: [request('cdn.example.com', 'functional'), request('new-analytics.example.com', 'analytics')],
      })],
    });
    const sc = compareScanResults(before, after).scenarios[0]!;
    expect(sc.domains.added).toEqual(['new-analytics.example.com']);
    expect(sc.domains.removed).toEqual(['old-ads.example.com']);
    expect(sc.trackingDomains.added).toEqual(['new-analytics.example.com']);
    expect(sc.trackingDomains.removed).toEqual(['old-ads.example.com']);
  });

  it('diffs storage keys by kind and key', () => {
    const storage = (key: string) => ({
      after_settle: [{ kind: 'localStorage' as const, key, valueHash: 'h', valueLength: 3, phase: 'after_settle' as const, capturedAt: '' }],
    });
    const before = scan({ scenarios: [scenario('no_action', { storage: storage('consent') })] });
    const after = scan({ scenarios: [scenario('no_action', { storage: storage('consent_v2') })] });
    const sc = compareScanResults(before, after).scenarios[0]!;
    expect(sc.storageKeys.added).toEqual(['localStorage:consent_v2']);
    expect(sc.storageKeys.removed).toEqual(['localStorage:consent']);
  });

  it('classifies findings as appeared, resolved or persisted by rule + scenario', () => {
    const before = scan({ findings: [finding('CT-001', 'no_action'), finding('CT-002', 'reject_all')] });
    const after = scan({
      findings: [finding('CT-002', 'reject_all'), finding('CT-003', 'reject_all'), finding('CT-001', 'no_action', 'pass')],
    });
    const cmp = compareScanResults(before, after);
    expect(cmp.findings.appeared.map((f) => f.ruleId)).toEqual(['CT-003']);
    expect(cmp.findings.resolved.map((f) => f.ruleId)).toEqual(['CT-001']);
    expect(cmp.findings.persisted.map((f) => f.ruleId)).toEqual(['CT-002']);
    expect(cmp.summary.findingsAppeared).toBe(1);
    expect(cmp.summary.findingsResolved).toBe(1);
  });

  it('treats the same rule in a different scenario as a different finding', () => {
    const before = scan({ findings: [finding('CT-003', 'accept_all')] });
    const after = scan({ findings: [finding('CT-003', 'reject_all')] });
    const cmp = compareScanResults(before, after);
    expect(cmp.findings.appeared).toHaveLength(1);
    expect(cmp.findings.resolved).toHaveLength(1);
    expect(cmp.findings.persisted).toHaveLength(0);
  });

  it('lists scenarios present in only one scan and skips them in per-scenario diffs', () => {
    const before = scan({ scenarios: [scenario('no_action'), scenario('withdraw_consent')] });
    const after = scan({ scenarios: [scenario('no_action'), scenario('essential_only')] });
    const cmp = compareScanResults(before, after);
    expect(cmp.scenarios.map((s) => s.scenario)).toEqual(['no_action']);
    expect(cmp.onlyInBefore).toEqual(['withdraw_consent']);
    expect(cmp.onlyInAfter).toEqual(['essential_only']);
  });

  it('identical scans produce an empty diff', () => {
    const s = scan({
      scenarios: [scenario('reject_all', {
        cookies: { after_settle: [cookie('_ga')] },
        network: [request('analytics.example.com', 'analytics')],
      })],
      findings: [finding('CT-002', 'reject_all')],
    });
    const cmp = compareScanResults(s, s);
    expect(cmp.summary).toEqual({
      cookiesAdded: 0, cookiesRemoved: 0, cookiesChanged: 0,
      domainsAdded: 0, domainsRemoved: 0,
      trackingDomainsAdded: 0, trackingDomainsRemoved: 0,
      findingsAppeared: 0, findingsResolved: 0,
    });
    expect(cmp.findings.persisted).toHaveLength(1);
  });
});
