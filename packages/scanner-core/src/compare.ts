/**
 * Whole-scan comparison: what changed between two ScanResults.
 *
 * The regression rules (CT-008…CT-010) answer "did this scan regress against
 * its baseline?" at scan time. This module answers the broader question a
 * human asks in the dashboard — "what is different between scan A and scan
 * B?" — across cookies, network domains, storage keys and rule findings,
 * per consent scenario. Pure and deterministic: same inputs, same diff.
 */
import type { CookieObservation, RuleResult, ScanResult, ScenarioResult, ScenarioType } from '@consenttrace/shared';
import { diffCookies, setDiff, trackingDomains, uniqueDomains, type CookieDiff } from './diff';

/** Cookies as finally settled for a scenario (mirrors the worker/dashboard semantics). */
function settledCookies(s: ScenarioResult): CookieObservation[] {
  return s.cookies.after_settle ?? s.cookies.after_page_load ?? [];
}

function settledStorageKeys(s: ScenarioResult): string[] {
  const items = s.storage.after_settle ?? s.storage.after_page_load ?? [];
  return items.map((i) => `${i.kind}:${i.key}`);
}

export interface ScenarioComparison {
  scenario: ScenarioType;
  beforeStatus: ScenarioResult['status'];
  afterStatus: ScenarioResult['status'];
  cookies: CookieDiff;
  /** All observed request domains. */
  domains: { added: string[]; removed: string[] };
  /** Analytics/advertising domains only — the subset consent cares about. */
  trackingDomains: { added: string[]; removed: string[] };
  storageKeys: { added: string[]; removed: string[] };
  bannerAfterReload: { before: boolean | null; after: boolean | null };
}

export interface FindingsComparison {
  /** Findings active in `after` that were not active in `before`. */
  appeared: RuleResult[];
  /** Findings active in `before` that are no longer active in `after`. */
  resolved: RuleResult[];
  /** Findings active in both (the `after` version, for display). */
  persisted: RuleResult[];
}

export interface ScanComparison {
  scenarios: ScenarioComparison[];
  /** Scenarios present in only one of the two scans. */
  onlyInBefore: ScenarioType[];
  onlyInAfter: ScenarioType[];
  findings: FindingsComparison;
  summary: {
    cookiesAdded: number;
    cookiesRemoved: number;
    cookiesChanged: number;
    domainsAdded: number;
    domainsRemoved: number;
    trackingDomainsAdded: number;
    trackingDomainsRemoved: number;
    findingsAppeared: number;
    findingsResolved: number;
  };
}

/** A finding is identified by the rule that produced it within a scenario. */
function findingKey(f: RuleResult): string {
  return `${f.ruleId}|${f.scenario ?? ''}`;
}

function activeFindings(result: ScanResult): Map<string, RuleResult> {
  const map = new Map<string, RuleResult>();
  for (const f of result.findings) {
    if (f.status === 'finding') map.set(findingKey(f), f);
  }
  return map;
}

function compareFindings(before: ScanResult, after: ScanResult): FindingsComparison {
  const b = activeFindings(before);
  const a = activeFindings(after);
  const appeared: RuleResult[] = [];
  const persisted: RuleResult[] = [];
  for (const [key, f] of a) {
    if (b.has(key)) persisted.push(f);
    else appeared.push(f);
  }
  const resolved: RuleResult[] = [];
  for (const [key, f] of b) {
    if (!a.has(key)) resolved.push(f);
  }
  const byRule = (x: RuleResult, y: RuleResult) =>
    x.ruleId.localeCompare(y.ruleId) || (x.scenario ?? '').localeCompare(y.scenario ?? '');
  return {
    appeared: appeared.sort(byRule),
    resolved: resolved.sort(byRule),
    persisted: persisted.sort(byRule),
  };
}

export function compareScanResults(before: ScanResult, after: ScanResult): ScanComparison {
  const beforeByScenario = new Map(before.scenarios.map((s) => [s.scenario, s]));
  const afterByScenario = new Map(after.scenarios.map((s) => [s.scenario, s]));

  const scenarios: ScenarioComparison[] = [];
  for (const [scenario, b] of beforeByScenario) {
    const a = afterByScenario.get(scenario);
    if (!a) continue;
    scenarios.push({
      scenario,
      beforeStatus: b.status,
      afterStatus: a.status,
      cookies: diffCookies(settledCookies(b), settledCookies(a)),
      domains: setDiff(uniqueDomains(b.network), uniqueDomains(a.network)),
      trackingDomains: setDiff(trackingDomains(b.network), trackingDomains(a.network)),
      storageKeys: setDiff(settledStorageKeys(b), settledStorageKeys(a)),
      bannerAfterReload: { before: b.bannerAfterReload, after: a.bannerAfterReload },
    });
  }
  // Stable order: follow the `after` scan's scenario order.
  const order = new Map(after.scenarios.map((s, i) => [s.scenario, i]));
  scenarios.sort((x, y) => (order.get(x.scenario) ?? 0) - (order.get(y.scenario) ?? 0));

  const findings = compareFindings(before, after);
  const sum = (fn: (s: ScenarioComparison) => number) => scenarios.reduce((acc, s) => acc + fn(s), 0);
  return {
    scenarios,
    onlyInBefore: [...beforeByScenario.keys()].filter((s) => !afterByScenario.has(s)),
    onlyInAfter: [...afterByScenario.keys()].filter((s) => !beforeByScenario.has(s)),
    findings,
    summary: {
      cookiesAdded: sum((s) => s.cookies.added.length),
      cookiesRemoved: sum((s) => s.cookies.removed.length),
      cookiesChanged: sum((s) => s.cookies.changed.length),
      domainsAdded: sum((s) => s.domains.added.length),
      domainsRemoved: sum((s) => s.domains.removed.length),
      trackingDomainsAdded: sum((s) => s.trackingDomains.added.length),
      trackingDomainsRemoved: sum((s) => s.trackingDomains.removed.length),
      findingsAppeared: findings.appeared.length,
      findingsResolved: findings.resolved.length,
    },
  };
}
