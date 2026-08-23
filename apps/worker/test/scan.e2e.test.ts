/**
 * End-to-end scanner tests against local fixtures (docs/TESTING.md).
 * Covers spec E2E tests 1 (proper banner), 2 (intentional regression),
 * SSRF blocking, and the reject-ignored / no-reject fixtures.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureServers, SITE_HOST, SITE_PORT, type FixtureServers } from '../../fixtures/src/server';
import { runScan, type ScanConfig } from '../src/index';
import { verifyManifest } from '@consenttrace/evidence';

const HOST_RULES =
  'MAP site.fixture.test 127.0.0.1, MAP metrics.fxanalytics.example 127.0.0.1, MAP cdn.fxtracker.example 127.0.0.1';

let servers: FixtureServers;
let workDir: string;

const fixtureConfig = (outSuffix: string, extra: Partial<ScanConfig> = {}): ScanConfig => ({
  url: `http://${SITE_HOST}:${SITE_PORT}/site`,
  outDir: join(workDir, outSuffix),
  scenarios: ['no_action', 'reject_all', 'accept_all'],
  settleMs: 1200,
  bannerWaitMs: 5000,
  allowPrivateTargets: true,
  hostResolverRules: HOST_RULES,
  domainOverrides: [
    { domain: 'metrics.fxanalytics.example', category: 'analytics', vendor: 'Fixture Analytics' },
    { domain: 'cdn.fxtracker.example', category: 'advertising', vendor: 'Fixture Ads' },
  ],
  inlineReportImages: false,
  ...extra,
});

const findingIds = (result: Awaited<ReturnType<typeof runScan>>['result']) =>
  result.findings.filter((f) => f.status === 'finding').map((f) => f.ruleId);

beforeAll(async () => {
  servers = await startFixtureServers();
  workDir = await mkdtemp(join(tmpdir(), 'ct-e2e-'));
});

afterAll(async () => {
  await servers.close();
});

describe('SSRF protection (E2E test 5)', () => {
  it('refuses loopback/private targets before any browser activity', async () => {
    const { result } = await runScan({
      url: `http://127.0.0.1:${SITE_PORT}/site`,
      outDir: join(workDir, 'ssrf-loopback'),
      scenarios: ['no_action'],
    });
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('SSRF_BLOCKED');
    expect(result.scenarios.length).toBe(0);
  });
  it('refuses cloud metadata endpoints', async () => {
    const { result } = await runScan({
      url: 'http://169.254.169.254/latest/meta-data/',
      outDir: join(workDir, 'ssrf-metadata'),
      scenarios: ['no_action'],
    });
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('SSRF_BLOCKED');
  });
});

describe('well-behaved banner (E2E test 1)', () => {
  it('scans all scenarios with correct observations and no findings', async () => {
    servers.setMode('clean');
    const { result, outDir } = await runScan(fixtureConfig('clean'));

    expect(result.status).toBe('completed');
    expect(result.scenarios).toHaveLength(3);

    const noAction = result.scenarios.find((s) => s.scenario === 'no_action')!;
    expect(noAction.cmp.detected).toBe(true);
    expect(noAction.cmp.candidateCount).toBeGreaterThanOrEqual(3);
    const noActionTracking = (noAction.cookies.after_settle ?? []).filter((c) => c.category === 'analytics' || c.category === 'advertising');
    expect(noActionTracking).toHaveLength(0);

    const reject = result.scenarios.find((s) => s.scenario === 'reject_all')!;
    expect(reject.consentAction?.type).toBe('reject_all');
    expect(reject.consentAction?.buttonText.toLowerCase()).toContain('reject');
    expect((reject.cookies.after_settle ?? []).some((c) => c.name === '_ga' || c.name === '_fbp')).toBe(false);
    expect(reject.bannerAfterReload).toBe(false);

    const accept = result.scenarios.find((s) => s.scenario === 'accept_all')!;
    expect(accept.consentAction?.type).toBe('accept_all');
    const acceptCookies = (accept.cookies.after_settle ?? []).map((c) => c.name);
    expect(acceptCookies).toContain('_ga');
    expect(acceptCookies).toContain('_fbp');
    const fbp = (accept.cookies.after_settle ?? []).find((c) => c.name === '_fbp')!;
    expect(fbp.category).toBe('advertising');
    expect(fbp.valueHash).toMatch(/^sha256:/); // raw values never stored
    const adRequests = accept.network.filter((n) => n.requestCategory === 'advertising' && n.atMs > accept.consentAction!.atMs);
    expect(adRequests.length).toBeGreaterThan(0);
    expect(adRequests[0]!.thirdParty).toBe(true);
    expect(accept.bannerAfterReload).toBe(false);

    expect(findingIds(result)).toEqual([]);
    expect(result.findings.filter((f) => f.status === 'pass').length).toBeGreaterThanOrEqual(5);

    // Evidence: screenshots + snapshots + manifest verify.
    expect(Object.keys(reject.screenshots)).toEqual(
      expect.arrayContaining(['initial_page', 'banner_visible', 'reject_before_click', 'reject_after_click', 'after_reload']),
    );
    const verification = await verifyManifest(outDir);
    expect(verification.ok).toBe(true);
    expect(result.evidence!.artifacts.length).toBeGreaterThan(20);

    // Timeline events exist in order.
    const types = reject.timeline.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['context_created', 'navigation_started', 'banner_detected', 'consent_action', 'persistence_check']));
  }, 120000);
});

describe('deployment regression against baseline (E2E test 2)', () => {
  it('detects pre-consent tracking introduced after a "deployment"', async () => {
    // Agencies baseline the compliant states: no-action and reject.
    servers.setMode('clean');
    const baselineRun = await runScan(fixtureConfig('baseline', { scenarios: ['no_action', 'reject_all'] }));
    expect(findingIds(baselineRun.result)).toEqual([]);

    // "Deployment" flips the same URL into buggy behavior: tags fire on load.
    servers.setMode('pre_consent_tracking');
    const regressed = await runScan(
      fixtureConfig('regressed', {
        scenarios: ['no_action', 'reject_all'],
        baselinePath: join(baselineRun.outDir, 'scan.json'),
      }),
    );

    const ids = findingIds(regressed.result);
    expect(ids).toContain('CT-001'); // tracking before choice
    expect(ids).toContain('CT-008'); // new cookies vs baseline (_ga/_gid/_fbp were never in the compliant baseline)
    expect(ids).toContain('CT-009'); // new third-party domains vs baseline
    expect(ids).toContain('CT-010'); // previously clean pre-consent state regressed
    const ct010 = regressed.result.findings.find((f) => f.ruleId === 'CT-010' && f.status === 'finding')!;
    expect(ct010.regression).toBe(true);
    expect(ct010.severity).toBe('high');
    expect(ct010.evidenceIds.length).toBeGreaterThan(0);
    expect(regressed.result.baselineScanId).toBe(baselineRun.result.scanId);
    const ct008 = regressed.result.findings.find((f) => f.ruleId === 'CT-008' && f.status === 'finding')!;
    expect(ct008.regression).toBe(true);
  }, 240000);

  it('reports no regression findings when a full baseline already covers accepted-state tracking', async () => {
    // A baseline that includes accept-all already contains _ga/_fbp and tracker
    // domains, so an unchanged clean deployment must NOT raise CT-008/009/010.
    servers.setMode('clean');
    const baselineRun = await runScan(fixtureConfig('full-baseline'));
    const rescan = await runScan(fixtureConfig('full-rescan', { baselinePath: join(baselineRun.outDir, 'scan.json') }));
    expect(findingIds(rescan.result)).toEqual([]);
    for (const id of ['CT-008', 'CT-009', 'CT-010']) {
      expect(rescan.result.findings.find((f) => f.ruleId === id)?.status).toBe('pass');
    }
  }, 240000);
});

describe('reject ignored by tags (fixture 3)', () => {
  it('fires CT-002 and CT-003 when rejection still tracks', async () => {
    servers.setMode('reject_ignored');
    const { result } = await runScan(fixtureConfig('reject-ignored', { scenarios: ['reject_all'] }));
    const reject = result.scenarios[0]!;
    expect(reject.consentAction?.type).toBe('reject_all');
    const ids = findingIds(result);
    expect(ids).toContain('CT-002');
    expect(ids).toContain('CT-003');
  }, 120000);
});

describe('missing reject action (fixture 4)', () => {
  it('reports reject_action_not_found as a structured observation and fires CT-004', async () => {
    servers.setMode('no_reject');
    const { result } = await runScan(fixtureConfig('no-reject', { scenarios: ['reject_all'] }));
    const reject = result.scenarios[0]!;
    expect(reject.consentAction).toBeNull();
    expect(reject.observations).toContain('reject_action_not_found');
    expect(reject.status).toBe('completed_with_observations');
    expect(findingIds(result)).toContain('CT-004');
    // No noncompliance is declared — the finding is a technical observation.
    const ct004 = result.findings.find((f) => f.ruleId === 'CT-004' && f.status === 'finding')!;
    expect(ct004.observation).not.toMatch(/illegal|non-compliant|violation/i);
  }, 120000);
});
