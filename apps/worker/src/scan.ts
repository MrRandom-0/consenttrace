/**
 * Playwright scan orchestrator. Every scenario runs in a fresh, isolated browser
 * context (clean cookies/storage). The recorder captures deterministic evidence;
 * the rule engine interprets it afterwards. See docs/SCANNER_ENGINE.md.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page, type Request } from 'playwright';
import {
  isFirstParty,
  RULE_PACK_VERSION,
  SCANNER_VERSION,
  type ConsentActionRecord,
  type CookieObservation,
  type CookieOverride,
  type DomainOverride,
  type NetworkObservation,
  type ScanResult,
  type ScenarioResult,
  type ScenarioType,
  type SnapshotPhase,
  type StorageObservation,
} from '@consenttrace/shared';
import { createNavigationGuard, validateScanUrl, type SsrfPolicy } from '@consenttrace/validation';
import {
  CMP_SIGNATURES,
  GENERIC_CONSENT_KEYWORDS,
  collectConsentSurfaces,
  collectStorage,
  selectActionCandidate,
  type CandidateControl,
  type InpageDetection,
} from '@consenttrace/scanner-core';
import { classifyCookie, classifyDomain, evaluateRules, summarizeBaseline, type BaselineSummary } from '@consenttrace/rule-engine';
import { EvidenceRecorder, valueHash } from '@consenttrace/evidence';
import { renderHtmlReport } from './report';

export interface ScanConfig {
  url: string;
  /** Caller-supplied scan id (e.g. the platform's DB uuid). Generated when omitted. */
  scanId?: string;
  scenarios?: ScenarioType[];
  outDir: string;
  settleMs?: number;
  bannerWaitMs?: number;
  navTimeoutMs?: number;
  scanTimeoutMs?: number;
  viewport?: { width: number; height: number };
  locale?: string;
  timezoneId?: string;
  /** DEV/TEST ONLY: allow loopback/private targets (fixture scanning). */
  allowPrivateTargets?: boolean;
  allowedPorts?: number[];
  /** Chromium host-resolver-rules, used to point fixture hostnames at 127.0.0.1. */
  hostResolverRules?: string;
  cookieOverrides?: CookieOverride[];
  domainOverrides?: DomainOverride[];
  /** Path to a previous scan.json to compare against (regression rules CT-008..CT-010). */
  baselinePath?: string;
  triggerType?: ScanResult['triggerType'];
  /** Inline screenshots into the HTML report as data URIs (self-contained evidence package). */
  inlineReportImages?: boolean;
}

interface ResolvedConfig extends Required<Omit<ScanConfig, 'scanId' | 'timezoneId' | 'hostResolverRules' | 'baselinePath' | 'cookieOverrides' | 'domainOverrides'>> {
  scanId: string | null;
  timezoneId: string | null;
  hostResolverRules: string | null;
  baselinePath: string | null;
  cookieOverrides: CookieOverride[];
  domainOverrides: DomainOverride[];
}

function resolveConfig(config: ScanConfig): ResolvedConfig {
  return {
    url: config.url,
    scanId: config.scanId ?? null,
    scenarios: config.scenarios ?? ['no_action', 'reject_all', 'accept_all'],
    outDir: config.outDir,
    settleMs: config.settleMs ?? 3000,
    bannerWaitMs: config.bannerWaitMs ?? 8000,
    navTimeoutMs: config.navTimeoutMs ?? 30000,
    scanTimeoutMs: config.scanTimeoutMs ?? 180000,
    viewport: config.viewport ?? { width: 1366, height: 900 },
    locale: config.locale ?? 'en-GB',
    timezoneId: config.timezoneId ?? null,
    allowPrivateTargets: config.allowPrivateTargets ?? false,
    allowedPorts: config.allowedPorts ?? [80, 443],
    hostResolverRules: config.hostResolverRules ?? null,
    cookieOverrides: config.cookieOverrides ?? [],
    domainOverrides: config.domainOverrides ?? [],
    baselinePath: config.baselinePath ?? null,
    triggerType: config.triggerType ?? 'manual_cloud',
    inlineReportImages: config.inlineReportImages ?? true,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function snapshotCookies(
  context: BrowserContext,
  pageHost: string,
  phase: SnapshotPhase,
  cfg: ResolvedConfig,
): Promise<CookieObservation[]> {
  const cookies = await context.cookies();
  const capturedAt = new Date().toISOString();
  return cookies.map((c) => {
    const classification = classifyCookie(c.name, c.domain, cfg.cookieOverrides);
    return {
      name: c.name,
      domain: c.domain,
      path: c.path,
      valueHash: valueHash(c.value),
      secure: c.secure,
      httpOnly: c.httpOnly,
      sameSite: (c.sameSite as CookieObservation['sameSite']) ?? 'unspecified',
      session: c.expires === -1,
      expiresAt: c.expires === -1 ? null : new Date(c.expires * 1000).toISOString(),
      firstParty: isFirstParty(pageHost, c.domain),
      category: classification.category,
      classificationSource: classification.source,
      vendor: classification.vendor,
      phase,
      capturedAt,
    };
  });
}

async function snapshotStorage(page: Page, phase: SnapshotPhase): Promise<StorageObservation[]> {
  const raw = await page.evaluate(collectStorage);
  const capturedAt = new Date().toISOString();
  const map = (kind: 'localStorage' | 'sessionStorage', entries: Array<{ key: string; value: string }>) =>
    entries.map((e) => ({ kind, key: e.key, valueHash: valueHash(e.value), valueLength: e.value.length, phase, capturedAt }));
  return [...map('localStorage', raw.local), ...map('sessionStorage', raw.session)];
}

interface ScenarioDeps {
  browser: Browser;
  cfg: ResolvedConfig;
  recorder: EvidenceRecorder;
  ssrfPolicy: SsrfPolicy;
}

async function runScenario(scenario: ScenarioType, deps: ScenarioDeps): Promise<ScenarioResult> {
  const { browser, cfg, recorder } = deps;
  const startedAt = new Date();
  const t0 = Date.now();
  const ms = () => Date.now() - t0;
  const pageHost = new URL(cfg.url).hostname;

  const result: ScenarioResult = {
    scenario,
    status: 'completed',
    startedAt: startedAt.toISOString(),
    durationMs: 0,
    cmp: { detected: false, confidence: 0, evidence: [] },
    consentAction: null,
    observations: [],
    cookies: {},
    storage: {},
    network: [],
    bannerAfterReload: null,
    screenshots: {},
    evidenceRefs: {},
    timeline: [],
    failureCode: null,
  };

  const event = (type: string, description: string, evidenceId?: string) => {
    const e = { scenario, atMs: ms(), at: new Date().toISOString(), type, description, ...(evidenceId ? { evidenceId } : {}) };
    recorder.addEvent(e);
    result.timeline.push(e);
  };

  const shot = async (page: Page, key: string, label: string) => {
    try {
      const buffer = await page.screenshot({ type: 'png' });
      const item = await recorder.addArtifact({
        relPath: `${scenario}/screenshot-${key}.png`,
        type: 'screenshot',
        scenario,
        label,
        data: buffer,
      });
      result.screenshots[key] = item.id;
      event('screenshot', label, item.id);
      return item.id;
    } catch {
      result.observations.push('screenshot_failed:' + key);
      return null;
    }
  };

  const saveCookieSnapshot = async (context: BrowserContext, phase: SnapshotPhase) => {
    const cookies = await snapshotCookies(context, pageHost, phase, cfg);
    result.cookies[phase] = cookies;
    const item = await recorder.addJsonArtifact({
      relPath: `${scenario}/cookies-${phase}.json`,
      type: 'cookie_snapshot',
      scenario,
      label: `Cookie snapshot (${phase})`,
      json: cookies,
    });
    result.evidenceRefs[`cookies_${phase}`] = item.id;
    event('cookie_snapshot', `Cookie snapshot captured (${phase}): ${cookies.length} cookie(s)`, item.id);
    return cookies;
  };

  const saveStorageSnapshot = async (page: Page, phase: SnapshotPhase) => {
    const storage = await snapshotStorage(page, phase);
    result.storage[phase] = storage;
    const item = await recorder.addJsonArtifact({
      relPath: `${scenario}/storage-${phase}.json`,
      type: 'storage_snapshot',
      scenario,
      label: `Storage snapshot (${phase})`,
      json: storage,
    });
    result.evidenceRefs[`storage_${phase}`] = item.id;
    return storage;
  };

  const guard = createNavigationGuard(deps.ssrfPolicy);
  const blockedNavigations: string[] = [];

  let context: BrowserContext | null = null;
  try {
    context = await browser.newContext({
      viewport: cfg.viewport,
      locale: cfg.locale,
      ...(cfg.timezoneId ? { timezoneId: cfg.timezoneId } : {}),
    });
    context.setDefaultTimeout(cfg.navTimeoutMs);
    const page = await context.newPage();
    // esbuild-based runners (tsx) inject a __name keep-names helper into transpiled
    // functions; define a no-op shim so serialized page.evaluate functions run
    // identically under tsx, vitest and compiled output.
    await page.addInitScript({ content: 'globalThis.__name = globalThis.__name || ((f) => f);' });
    event('context_created', 'Browser context created (clean cookies and storage)');

    // Network observation + SSRF navigation guard.
    const requestMeta = new Map<Request, NetworkObservation>();
    page.on('request', (req) => {
      let url: URL;
      try {
        url = new URL(req.url());
      } catch {
        return;
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      const domainClass = classifyDomain(url.hostname, cfg.domainOverrides);
      const obs: NetworkObservation = {
        urlNormalized: url.origin + url.pathname,
        domain: url.hostname,
        method: req.method(),
        resourceType: req.resourceType(),
        atMs: ms(),
        timestamp: new Date().toISOString(),
        requestCategory: domainClass.category,
        vendor: domainClass.vendor,
        thirdParty: !isFirstParty(pageHost, url.hostname),
        blocked: false,
        status: null,
      };
      requestMeta.set(req, obs);
      result.network.push(obs);
      if (obs.requestCategory === 'advertising' || obs.requestCategory === 'analytics') {
        event('tracking_request', `Request to ${obs.domain} (${obs.requestCategory}${obs.vendor ? ', ' + obs.vendor : ''})`);
      }
    });
    page.on('response', (res) => {
      const obs = requestMeta.get(res.request());
      if (obs) obs.status = res.status();
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error' && result.observations.length < 25) {
        result.observations.push('console_error:' + msg.text().slice(0, 200));
      }
    });

    await context.route('**/*', async (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
        const verdict = await guard.check(req.url(), req.redirectedFrom() !== null);
        if (!verdict.allowed) {
          blockedNavigations.push(`${req.url()} — ${verdict.reason ?? 'blocked'}`);
          const obs = requestMeta.get(req);
          if (obs) obs.blocked = true;
          return route.abort('blockedbyclient');
        }
      }
      return route.continue();
    });

    event('navigation_started', `Navigating to ${cfg.url}`);
    await page.goto(cfg.url, { waitUntil: 'load', timeout: cfg.navTimeoutMs });
    event('navigation_finished', `Page loaded: ${page.url()}`);

    await saveCookieSnapshot(context, 'after_page_load');
    await saveStorageSnapshot(page, 'after_page_load');
    await shot(page, 'initial_page', 'Initial page state');

    // CMP detection: poll until the banner is present or the wait budget is spent.
    const detectArgs = {
      signatures: CMP_SIGNATURES.map((s) => ({ provider: s.provider, selectors: s.selectors, apis: s.apis })),
      keywords: GENERIC_CONSENT_KEYWORDS,
      maxCandidates: 40,
    };
    let detection: InpageDetection | null = null;
    const bannerDeadline = Date.now() + cfg.bannerWaitMs;
    do {
      detection = await page.evaluate(collectConsentSurfaces, detectArgs);
      if (detection.containerFound && detection.containerVisible) break;
      await sleep(400);
    } while (Date.now() < bannerDeadline);

    if (detection && detection.containerFound) {
      const evidence = [
        ...detection.signatureMatches.map((m) => ({ kind: m.kind, detail: `${m.provider}: ${m.detail}` })),
        ...(detection.usedGenericHeuristic
          ? [{ kind: 'keyword_heuristic' as const, detail: 'Generic overlay heuristic (keywords + controls + positioning)' }]
          : []),
        ...(detection.tcfApiPresent ? [{ kind: 'api_present' as const, detail: 'window.__tcfapi' }] : []),
      ];
      const selectorMatched = detection.signatureMatches.some((m) => m.kind === 'selector_match');
      result.cmp = {
        detected: true,
        provider: detection.containerProvider ?? undefined,
        confidence: selectorMatched ? 0.95 : detection.usedGenericHeuristic ? 0.6 : 0.7,
        evidence,
        bannerText: detection.bannerText,
        candidateCount: detection.candidates.length,
      };
      const uiItem = await recorder.addJsonArtifact({
        relPath: `${scenario}/consent-ui.json`,
        type: 'html_snippet',
        scenario,
        label: 'Detected consent interface (text + candidate controls)',
        json: { bannerText: detection.bannerText, candidates: detection.candidates, signatureMatches: detection.signatureMatches },
      });
      result.evidenceRefs['consent_ui'] = uiItem.id;
      event(
        'banner_detected',
        `Consent banner detected${result.cmp.provider ? ` (${result.cmp.provider})` : ' (custom banner)'} with ${detection.candidates.length} candidate control(s)`,
        uiItem.id,
      );
      await shot(page, 'banner_visible', 'Consent banner visible');
    } else {
      event('banner_not_detected', 'No consent banner detected within the wait budget');
    }

    // Scenario-specific consent action.
    const desired = scenario === 'accept_all' ? 'accept_all' : scenario === 'reject_all' ? 'reject_all' : null;
    if (desired && detection && detection.containerFound) {
      const candidates: CandidateControl[] = detection.candidates;
      const selected = selectActionCandidate(candidates, desired, 'medium');
      if (!selected) {
        result.observations.push(desired === 'reject_all' ? 'reject_action_not_found' : 'accept_action_not_found');
        result.status = 'completed_with_observations';
        event('action_not_found', `No ${desired} control found among ${candidates.length} candidate(s). No click performed.`);
      } else {
        await saveCookieSnapshot(context, 'before_consent_action');
        const beforeId = await shot(page, `${desired === 'accept_all' ? 'accept' : 'reject'}_before_click`, `Before ${desired} click`);
        try {
          await page.click(`[data-ct-id="${selected.candidate.ctId}"]`, { timeout: 5000 });
          const clickedAt = ms();
          const afterId = await shot(page, `${desired === 'accept_all' ? 'accept' : 'reject'}_after_click`, `Immediately after ${desired} click`);
          result.consentAction = {
            type: desired,
            buttonText: selected.candidate.text || selected.candidate.ariaLabel || '',
            selectorStrategy: 'deterministic_text_match',
            elementRole: selected.candidate.role ?? selected.candidate.tag,
            interactionAt: new Date().toISOString(),
            atMs: clickedAt,
            confidence: selected.classification.confidence,
            screenshotBeforeEvidenceId: beforeId,
            screenshotAfterEvidenceId: afterId,
          } satisfies ConsentActionRecord;
          const actionItem = await recorder.addJsonArtifact({
            relPath: `${scenario}/consent-action.json`,
            type: 'html_snippet',
            scenario,
            label: `Consent action record (${desired})`,
            json: result.consentAction,
          });
          result.evidenceRefs['consent_action'] = actionItem.id;
          event('consent_action', `Clicked "${result.consentAction.buttonText}" (${desired}, confidence ${selected.classification.confidence})`, actionItem.id);
          await saveCookieSnapshot(context, 'immediately_after_action');
        } catch {
          result.observations.push('action_click_failed');
          result.status = 'completed_with_observations';
          result.failureCode = 'ACTION_CLICK_FAILED';
          event('action_click_failed', `Click on "${selected.candidate.text}" failed`);
        }
      }
    }

    // Stabilization window, then capture resulting state.
    await sleep(cfg.settleMs);
    const beforeSettleCookies = result.cookies['after_page_load'] ?? [];
    const settled = await saveCookieSnapshot(context, 'after_settle');
    await saveStorageSnapshot(page, 'after_settle');
    const newlyCreated = settled.filter(
      (c) => !beforeSettleCookies.some((b) => b.name === c.name && b.domain === c.domain && b.path === c.path),
    );
    for (const c of newlyCreated.slice(0, 30)) {
      event('cookie_created', `Cookie ${c.name} observed (${c.category}${c.vendor ? ', ' + c.vendor : ''}, ${c.firstParty ? 'first-party' : 'third-party'})`);
    }

    // Persistence check: reload and observe whether the banner returns.
    if (scenario === 'accept_all' || scenario === 'reject_all') {
      event('reload_started', 'Reloading page to test consent persistence');
      await page.reload({ waitUntil: 'load', timeout: cfg.navTimeoutMs });
      await sleep(Math.min(cfg.settleMs, 2000));
      const post: InpageDetection = await page.evaluate(collectConsentSurfaces, detectArgs);
      result.bannerAfterReload = post.containerFound && post.containerVisible;
      event(
        'persistence_check',
        result.bannerAfterReload
          ? 'Consent banner visible again after reload (preference may not persist)'
          : 'Consent banner not shown after reload (preference persisted)',
      );
      await saveCookieSnapshot(context, 'after_reload');
      await saveStorageSnapshot(page, 'after_reload');
      await shot(page, 'after_reload', 'Page state after reload');
    }

    const networkItem = await recorder.addJsonArtifact({
      relPath: `${scenario}/network.json`,
      type: 'network_log',
      scenario,
      label: 'Normalized network log',
      json: result.network,
    });
    result.evidenceRefs['network_log'] = networkItem.id;
    event('scenario_complete', `Scenario ${scenario} finished with ${result.network.length} request(s) observed`);
  } catch (err) {
    result.status = 'failed';
    const message = (err as Error).message ?? String(err);
    if (blockedNavigations.length > 0) {
      result.failureCode = 'SSRF_BLOCKED';
      result.observations.push(...blockedNavigations.map((b) => 'navigation_blocked:' + b));
      event('navigation_blocked', `Navigation blocked by SSRF policy: ${blockedNavigations[0]}`);
    } else if (message.includes('Timeout')) {
      result.failureCode = 'NAVIGATION_TIMEOUT';
    } else if (message.includes('crash')) {
      result.failureCode = 'PAGE_CRASHED';
    } else {
      result.failureCode = 'NAVIGATION_FAILED';
    }
    result.observations.push('error:' + message.slice(0, 300));
    event('scenario_failed', `Scenario failed (${result.failureCode})`);
  } finally {
    await context?.close();
  }

  result.durationMs = ms();
  return result;
}

export async function runScan(input: ScanConfig): Promise<{ result: ScanResult; outDir: string }> {
  const cfg = resolveConfig(input);
  const scanId = cfg.scanId ?? 'scan_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const startedAt = new Date().toISOString();
  await mkdir(cfg.outDir, { recursive: true });
  const recorder = new EvidenceRecorder(cfg.outDir, scanId);

  const ssrfPolicy: SsrfPolicy = {
    allowPrivateTargets: cfg.allowPrivateTargets,
    allowedPorts: cfg.allowedPorts,
    maxRedirects: 10,
  };

  const base: Omit<ScanResult, 'scenarios' | 'findings' | 'evidence' | 'status' | 'completedAt'> = {
    scanId,
    url: cfg.url,
    finalUrl: null,
    triggerType: cfg.triggerType,
    startedAt,
    scannerVersion: SCANNER_VERSION,
    rulePackVersion: RULE_PACK_VERSION,
    browser: { name: 'chromium', version: 'unknown' },
    viewport: cfg.viewport,
    locale: cfg.locale,
    timezoneId: cfg.timezoneId,
    regionProfile: null,
    baselineScanId: null,
    failureCode: null,
    failureMessage: null,
  };

  // SSRF: validate the target BEFORE any browser activity.
  const validation = await validateScanUrl(cfg.url, ssrfPolicy);
  if (!validation.ok) {
    const failed: ScanResult = {
      ...base,
      status: 'failed',
      completedAt: new Date().toISOString(),
      scenarios: [],
      findings: [],
      evidence: null,
      failureCode: validation.code ?? 'INVALID_TARGET_URL',
      failureMessage: validation.reason ?? 'Target URL failed validation.',
    };
    await writeFile(join(cfg.outDir, 'scan.json'), JSON.stringify(failed, null, 2));
    return { result: failed, outDir: cfg.outDir };
  }

  let baseline: BaselineSummary | undefined;
  let baselineScanId: string | null = null;
  if (cfg.baselinePath) {
    const baselineScan: ScanResult = JSON.parse(await readFile(cfg.baselinePath, 'utf8'));
    baseline = summarizeBaseline(baselineScan);
    baselineScanId = baselineScan.scanId;
  }

  const launchArgs: string[] = [];
  if (cfg.hostResolverRules) launchArgs.push(`--host-resolver-rules=${cfg.hostResolverRules}`);
  const browser = await chromium.launch({ headless: true, args: launchArgs });

  const scenarios: ScenarioResult[] = [];
  const deadline = Date.now() + cfg.scanTimeoutMs;
  try {
    for (const scenario of cfg.scenarios) {
      if (Date.now() > deadline) {
        scenarios.push({
          scenario,
          status: 'skipped',
          startedAt: new Date().toISOString(),
          durationMs: 0,
          cmp: { detected: false, confidence: 0, evidence: [] },
          consentAction: null,
          observations: ['skipped:worker_timeout'],
          cookies: {},
          storage: {},
          network: [],
          bannerAfterReload: null,
          screenshots: {},
          evidenceRefs: {},
          timeline: [],
          failureCode: 'WORKER_TIMEOUT',
        });
        continue;
      }
      scenarios.push(await runScenario(scenario, { browser, cfg, recorder, ssrfPolicy }));
    }

    const scenarioMap: Partial<Record<ScenarioType, ScenarioResult>> = {};
    for (const s of scenarios) scenarioMap[s.scenario] = s;
    const findings = evaluateRules({ scenarios: scenarioMap, baseline });

    const manifest = await recorder.finalize();
    const result: ScanResult = {
      ...base,
      browser: { name: 'chromium', version: browser.version() },
      status: scenarios.every((s) => s.status === 'failed') ? 'failed' : 'completed',
      completedAt: new Date().toISOString(),
      scenarios,
      findings,
      evidence: manifest,
      baselineScanId,
      failureCode: scenarios.every((s) => s.status === 'failed') ? scenarios[0]?.failureCode ?? null : null,
      failureMessage: null,
    };
    await writeFile(join(cfg.outDir, 'scan.json'), JSON.stringify(result, null, 2));
    const html = await renderHtmlReport(result, { outDir: cfg.outDir, inlineImages: cfg.inlineReportImages });
    await writeFile(join(cfg.outDir, 'report.html'), html);
    return { result, outDir: cfg.outDir };
  } finally {
    await browser.close();
  }
}
