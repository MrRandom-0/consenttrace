/**
 * Per-origin check history (summaries only — no cookie values, no screenshots).
 * Enables "compare with the last check on this site" without a cloud account.
 */
import { isExtensionContext } from './chromex';
import type { HistoryDelta, SessionSummary } from './types';

const KEY = 'ct_history_v1';
const MAX_ORIGINS = 30;
let memory: Record<string, SessionSummary> = {};

async function loadAll(): Promise<Record<string, SessionSummary>> {
  if (!isExtensionContext()) return memory;
  const stored = await chrome.storage.local.get(KEY);
  return (stored[KEY] as Record<string, SessionSummary> | undefined) ?? {};
}

export async function getPreviousSummary(origin: string): Promise<SessionSummary | null> {
  const all = await loadAll();
  return all[origin] ?? null;
}

export async function saveSummary(summary: SessionSummary): Promise<void> {
  const all = await loadAll();
  all[summary.origin] = summary;
  const entries = Object.entries(all)
    .sort((a, b) => b[1].atEpoch - a[1].atEpoch)
    .slice(0, MAX_ORIGINS);
  memory = Object.fromEntries(entries);
  if (isExtensionContext()) await chrome.storage.local.set({ [KEY]: memory });
}

export function computeDelta(previous: SessionSummary, current: SessionSummary): HistoryDelta {
  const diff = (before: string[], after: string[]) => ({
    added: after.filter((x) => !before.includes(x)),
    removed: before.filter((x) => !after.includes(x)),
  });
  const cookies = diff(previous.trackingCookieNames, current.trackingCookieNames);
  const domains = diff(previous.trackingDomains, current.trackingDomains);
  return {
    newTrackingCookies: cookies.added,
    removedTrackingCookies: cookies.removed,
    newTrackingDomains: domains.added,
    removedTrackingDomains: domains.removed,
  };
}
