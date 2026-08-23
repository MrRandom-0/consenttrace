import { describe, expect, it } from 'vitest';
import { buildCookieObservations, classifyResources, diffPanelSnapshots, synthesizeFindings, trackingSummary } from '../lib/evidence';
import { freshSession } from '../lib/session';
import type { RawCookie } from '../lib/chromex';
import type { PanelSnapshot, QuickSession } from '../lib/types';
import type { CookieObservation } from '@consenttrace/shared';

const raw = (name: string, overrides: Partial<RawCookie> = {}): RawCookie => ({
  name,
  value: 'secret-value-123',
  domain: '.shop.example',
  path: '/',
  secure: true,
  httpOnly: false,
  sameSite: 'lax',
  session: false,
  expirationDate: Date.now() / 1000 + 3600,
  ...overrides,
});

const obs = (name: string, category: CookieObservation['category']): CookieObservation => ({
  name,
  domain: '.shop.example',
  path: '/',
  valueHash: 'sha256:test',
  secure: true,
  httpOnly: false,
  sameSite: 'Lax',
  session: false,
  expiresAt: null,
  firstParty: true,
  category,
  classificationSource: category === 'unknown' ? 'unclassified' : 'known_signature',
  vendor: null,
  phase: 'after_settle',
  capturedAt: new Date().toISOString(),
});

const snap = (partial: Partial<PanelSnapshot>): PanelSnapshot => ({
  cookies: [],
  storage: [],
  resources: [],
  bannerVisible: null,
  atEpoch: Date.now(),
  atPageMs: 2000,
  ...partial,
});

function sessionWith(partial: Partial<QuickSession>): QuickSession {
  return {
    ...freshSession({ url: 'https://shop.example/', origin: 'https://shop.example' }),
    cmp: { detected: true, confidence: 0.9, evidence: [] },
    ...partial,
  };
}

describe('buildCookieObservations', () => {
  it('hashes values, maps sameSite and classifies via the shared KB', async () => {
    const [ga] = await buildCookieObservations([raw('_ga', { sameSite: 'no_restriction' })], 'shop.example', 'after_settle');
    expect(ga!.valueHash).toMatch(/^sha256:[a-f0-9]{24}$/);
    expect(JSON.stringify(ga)).not.toContain('secret-value-123');
    expect(ga!.sameSite).toBe('None');
    expect(ga!.category).toBe('analytics');
    expect(ga!.firstParty).toBe(true);
  });
});

describe('classifyResources', () => {
  it('normalizes URLs, classifies domains and flags third parties', () => {
    const resources = classifyResources(
      {
        nowMs: 5000,
        entries: [
          { name: 'https://connect.facebook.net/en_US/fbevents.js?v=1&secret=x', initiatorType: 'script', startMs: 900 },
          { name: 'https://shop.example/app.css', initiatorType: 'link', startMs: 100 },
          { name: 'data:image/png;base64,xxx', initiatorType: 'img', startMs: 50 },
        ],
      },
      'shop.example',
    );
    expect(resources).toHaveLength(2);
    const fb = resources.find((r) => r.domain === 'connect.facebook.net')!;
    expect(fb.category).toBe('advertising');
    expect(fb.thirdParty).toBe(true);
    expect(fb.urlNormalized).not.toContain('secret');
  });
});

describe('synthesizeFindings — rule parity with the worker', () => {
  it('fires CT-001 when tracking cookies exist while the banner is pending', () => {
    const session = sessionWith({
      snapshots: { baseline: snap({ bannerVisible: true, cookies: [obs('_fbp', 'advertising')] }) },
    });
    const { findings } = synthesizeFindings(session);
    expect(findings.find((f) => f.ruleId === 'CT-001')?.status).toBe('finding');
  });
  it('skips CT-001 and adds an observation when the banner is not visible (existing consent state)', () => {
    const session = sessionWith({
      snapshots: { baseline: snap({ bannerVisible: false, cookies: [obs('_fbp', 'advertising')] }) },
    });
    const { findings, observations } = synthesizeFindings(session);
    expect(findings.find((f) => f.ruleId === 'CT-001')).toBeUndefined();
    expect(observations.join(' ')).toContain('clean profile');
  });
  it('fires CT-002/CT-003 after a guided reject that still tracks', () => {
    const session = sessionWith({
      snapshots: {
        baseline: snap({ bannerVisible: true }),
        afterAction: snap({
          cookies: [obs('_ga', 'analytics')],
          resources: [
            {
              urlNormalized: 'https://connect.facebook.net/tr',
              domain: 'connect.facebook.net',
              initiatorType: 'img',
              startMs: 4200,
              category: 'advertising',
              vendor: 'Meta Pixel',
              thirdParty: true,
            },
          ],
        }),
      },
      action: { kind: 'reject_all', buttonText: 'Reject all', confidence: 'high', mode: 'guided', atPageMs: 3000, atEpoch: Date.now() },
    });
    const { findings } = synthesizeFindings(session);
    expect(findings.find((f) => f.ruleId === 'CT-002')?.status).toBe('finding');
    expect(findings.find((f) => f.ruleId === 'CT-003')?.status).toBe('finding');
  });
  it('fires CT-007 when the banner returns after reload', () => {
    const session = sessionWith({
      snapshots: {
        baseline: snap({ bannerVisible: true }),
        afterAction: snap({}),
        afterReload: snap({ bannerVisible: true }),
      },
      action: { kind: 'reject_all', buttonText: 'Reject all', confidence: 'high', mode: 'guided', atPageMs: 3000, atEpoch: Date.now() },
    });
    const { findings } = synthesizeFindings(session);
    expect(findings.find((f) => f.ruleId === 'CT-007' && f.status === 'finding')).toBeDefined();
  });
  it('manual interactions never produce reject-rule findings (no attributable click time)', () => {
    const session = sessionWith({
      snapshots: { baseline: snap({ bannerVisible: true }), afterAction: snap({ cookies: [obs('_ga', 'analytics')] }) },
      action: null,
    });
    const { findings } = synthesizeFindings(session);
    expect(findings.find((f) => f.ruleId === 'CT-002')).toBeUndefined();
  });
});

describe('diff & summaries', () => {
  it('diffs cookies, tracking domains and storage keys', () => {
    const before = snap({ cookies: [obs('session_id', 'strictly_necessary')] });
    const after = snap({
      cookies: [obs('session_id', 'strictly_necessary'), obs('_fbp', 'advertising')],
      resources: [
        {
          urlNormalized: 'https://x.tracker.example/p',
          domain: 'x.tracker.example',
          initiatorType: 'img',
          startMs: 1,
          category: 'advertising',
          vendor: null,
          thirdParty: true,
        },
      ],
      storage: [{ kind: 'localStorage', key: 'ad_id', valueHash: 'sha256:x', valueLength: 4, phase: 'after_settle', capturedAt: '' }],
    });
    const diff = diffPanelSnapshots(before, after);
    expect(diff.cookies.added.map((c) => c.name)).toEqual(['_fbp']);
    expect(diff.newTrackingDomains).toEqual(['x.tracker.example']);
    expect(diff.newStorageKeys).toEqual(['localStorage|ad_id']);
    expect(trackingSummary(after).cookieNames).toEqual(['_fbp']);
  });
});
