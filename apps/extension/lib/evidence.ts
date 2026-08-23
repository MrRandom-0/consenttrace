/**
 * Pure evidence logic for the panel: observation builders, deterministic rule
 * synthesis (the SAME rules the cloud worker runs), diffs and history summaries.
 * No chrome APIs — fully unit-testable.
 */
import {
  isFirstParty,
  type CookieObservation,
  type NetworkObservation,
  type RuleResult,
  type ScenarioResult,
  type SnapshotPhase,
  type StorageObservation,
} from '@consenttrace/shared';
import { diffCookies, type CookieDiff } from '@consenttrace/scanner-core';
import { classifyCookie, classifyDomain, CT_001, CT_002, CT_003, CT_005, CT_007, evaluateRules } from '@consenttrace/rule-engine';
import type { InpageStorage } from '@consenttrace/scanner-core';
import { valueHash } from './hash';
import type { RawCookie } from './chromex';
import type { ResourceCapture } from './inject';
import type { ClassifiedResource, PanelSnapshot, QuickSession, SessionSummary } from './types';

export async function buildCookieObservations(
  raw: RawCookie[],
  pageHost: string,
  phase: SnapshotPhase,
): Promise<CookieObservation[]> {
  const capturedAt = new Date().toISOString();
  return Promise.all(
    raw.map(async (c) => {
      const classification = classifyCookie(c.name, c.domain);
      return {
        name: c.name,
        domain: c.domain,
        path: c.path,
        valueHash: await valueHash(c.value),
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite:
          c.sameSite === 'no_restriction' ? ('None' as const)
          : c.sameSite === 'lax' ? ('Lax' as const)
          : c.sameSite === 'strict' ? ('Strict' as const)
          : ('unspecified' as const),
        session: c.session,
        expiresAt: c.expirationDate !== undefined ? new Date(c.expirationDate * 1000).toISOString() : null,
        firstParty: isFirstParty(pageHost, c.domain),
        category: classification.category,
        classificationSource: classification.source,
        vendor: classification.vendor,
        phase,
        capturedAt,
      } satisfies CookieObservation;
    }),
  );
}

export async function buildStorageObservations(
  raw: InpageStorage,
  phase: SnapshotPhase,
): Promise<StorageObservation[]> {
  const capturedAt = new Date().toISOString();
  const map = async (kind: 'localStorage' | 'sessionStorage', entries: Array<{ key: string; value: string }>) =>
    Promise.all(
      entries.map(async (e) => ({
        kind,
        key: e.key,
        valueHash: await valueHash(e.value),
        valueLength: e.value.length,
        phase,
        capturedAt,
      })),
    );
  return [...(await map('localStorage', raw.local)), ...(await map('sessionStorage', raw.session))];
}

export function classifyResources(capture: ResourceCapture, pageHost: string): ClassifiedResource[] {
  const out: ClassifiedResource[] = [];
  for (const entry of capture.entries) {
    let url: URL;
    try {
      url = new URL(entry.name);
    } catch {
      continue;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') continue;
    const classification = classifyDomain(url.hostname);
    out.push({
      urlNormalized: url.origin + url.pathname,
      domain: url.hostname,
      initiatorType: entry.initiatorType,
      startMs: entry.startMs,
      category: classification.category,
      vendor: classification.vendor,
      thirdParty: !isFirstParty(pageHost, url.hostname),
    });
  }
  return out;
}

function toNetworkObservations(resources: ClassifiedResource[]): NetworkObservation[] {
  return resources.map((r) => ({
    urlNormalized: r.urlNormalized,
    domain: r.domain,
    method: 'GET',
    resourceType: r.initiatorType,
    atMs: r.startMs,
    timestamp: new Date().toISOString(),
    requestCategory: r.category,
    vendor: r.vendor,
    thirdParty: r.thirdParty,
    blocked: false,
    status: null,
  }));
}

function emptyScenario(scenario: ScenarioResult['scenario'], session: QuickSession): ScenarioResult {
  return {
    scenario,
    status: 'completed',
    startedAt: new Date(session.startedAtEpoch).toISOString(),
    durationMs: 0,
    cmp: session.cmp ?? { detected: false, confidence: 0, evidence: [] },
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
}

/**
 * Synthesize scenario evidence from the live-browser session and run the SAME
 * deterministic rules the cloud worker uses. Scope honesty:
 * - Pre-consent rules (CT-001) only apply when the banner is currently visible
 *   (a pending choice). An existing consent state in this profile is surfaced
 *   as an observation instead — clean-state testing is the worker's job.
 * - Reject rules (CT-002/003) apply only after a guided reject with a known
 *   click timestamp on the page clock.
 */
export function synthesizeFindings(session: QuickSession): { findings: RuleResult[]; observations: string[] } {
  const observations: string[] = [];
  const baseline = session.snapshots.baseline;
  if (!baseline) return { findings: [], observations };

  const scenarios: Partial<Record<ScenarioResult['scenario'], ScenarioResult>> = {};
  // CT-001 (pre-consent storage) is only meaningful while a choice is pending.
  // When the banner is not visible, we skip it entirely rather than report a
  // misleading pass — the profile may already hold a consent state.
  const preConsentTestable = baseline.bannerVisible === true;

  const noAction = emptyScenario('no_action', session);
  noAction.network = toNetworkObservations(baseline.resources);
  if (preConsentTestable) {
    noAction.cookies = { after_settle: baseline.cookies };
    noAction.storage = { after_settle: baseline.storage };
  } else if (session.cmp?.detected) {
    observations.push(
      'Consent interface detected but not visible — this browser profile may already hold a consent state. Pre-consent behavior requires a clean profile or a ConsentTrace cloud scan.',
    );
  }
  scenarios.no_action = noAction;

  if (session.action && session.action.mode === 'guided') {
    const after = session.snapshots.afterAction;
    const scenarioKey = session.action.kind;
    const scenario = emptyScenario(scenarioKey, session);
    scenario.consentAction = {
      type: session.action.kind,
      buttonText: session.action.buttonText,
      selectorStrategy: 'deterministic_text_match',
      elementRole: 'button',
      interactionAt: new Date(session.action.atEpoch).toISOString(),
      atMs: session.action.atPageMs,
      confidence: session.action.confidence,
      screenshotBeforeEvidenceId: null,
      screenshotAfterEvidenceId: null,
    };
    if (after) {
      scenario.cookies = { after_settle: after.cookies };
      scenario.storage = { after_settle: after.storage };
      scenario.network = toNetworkObservations(after.resources);
    }
    const reload = session.snapshots.afterReload;
    if (reload) {
      scenario.cookies = { ...scenario.cookies, after_reload: reload.cookies };
      scenario.bannerAfterReload = reload.bannerVisible;
    }
    scenarios[scenarioKey] = scenario;
  }

  const rules = preConsentTestable ? [CT_001, CT_002, CT_003, CT_005, CT_007] : [CT_002, CT_003, CT_005, CT_007];
  const findings = evaluateRules({ scenarios }, rules).filter((f) => f.status !== 'not_applicable');
  return { findings, observations };
}

export interface PanelDiff {
  cookies: CookieDiff;
  newTrackingDomains: string[];
  newStorageKeys: string[];
}

export function diffPanelSnapshots(before: PanelSnapshot, after: PanelSnapshot): PanelDiff {
  const beforeDomains = new Set(
    before.resources.filter((r) => r.category === 'analytics' || r.category === 'advertising').map((r) => r.domain),
  );
  const afterDomains = after.resources
    .filter((r) => r.category === 'analytics' || r.category === 'advertising')
    .map((r) => r.domain);
  const beforeKeys = new Set(before.storage.map((s) => `${s.kind}|${s.key}`));
  return {
    cookies: diffCookies(before.cookies, after.cookies),
    newTrackingDomains: [...new Set(afterDomains.filter((d) => !beforeDomains.has(d)))],
    newStorageKeys: after.storage.map((s) => `${s.kind}|${s.key}`).filter((k) => !beforeKeys.has(k)),
  };
}

export function trackingSummary(snapshot: PanelSnapshot): { cookieNames: string[]; domains: string[] } {
  return {
    cookieNames: snapshot.cookies
      .filter((c) => c.category === 'analytics' || c.category === 'advertising')
      .map((c) => c.name)
      .sort(),
    domains: [
      ...new Set(
        snapshot.resources
          .filter((r) => r.category === 'analytics' || r.category === 'advertising')
          .map((r) => r.domain),
      ),
    ].sort(),
  };
}

export function summarizeSession(session: QuickSession): SessionSummary {
  const latest = session.snapshots.afterReload ?? session.snapshots.afterAction ?? session.snapshots.baseline;
  const tracking = latest ? trackingSummary(latest) : { cookieNames: [], domains: [] };
  return {
    origin: session.origin,
    atEpoch: Date.now(),
    cookieCount: latest?.cookies.length ?? 0,
    trackingCookieNames: tracking.cookieNames,
    trackingDomains: tracking.domains,
    cmpProvider: session.cmp?.provider ?? (session.cmp?.detected ? 'custom' : null),
    findingCount: session.findings.filter((f) => f.status === 'finding').length,
  };
}
