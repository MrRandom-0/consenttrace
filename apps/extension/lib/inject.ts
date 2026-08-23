/**
 * Self-contained functions injected via chrome.scripting.executeScript.
 * Same constraints as the shared collector: no imports/closures; the page DOM
 * is hostile — extract metadata only. They run in the ISOLATED world, so page
 * JavaScript cannot tamper with them (and page globals are intentionally
 * invisible — CMP window-API evidence is a worker-only signal).
 */

export interface ResourceEntryLite {
  name: string;
  initiatorType: string;
  startMs: number;
}

export interface ResourceCapture {
  nowMs: number;
  entries: ResourceEntryLite[];
}

export const captureResources = (): ResourceCapture => {
  const g = globalThis as Record<string, unknown>;
  if (typeof g['__name'] !== 'function') g['__name'] = (f: unknown) => f;
  const entries = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
    .slice(0, 800)
    .map((e) => ({ name: e.name, initiatorType: e.initiatorType, startMs: Math.round(e.startTime) }));
  return { nowMs: Math.round(performance.now()), entries };
};

export interface ClickResult {
  clicked: boolean;
  atPageMs: number;
  reason: string | null;
}

/**
 * Click a control previously tagged by the shared collector. Deterministic
 * safety: only [data-ct-id] elements (inside the detected consent UI) are
 * addressable, and the element must be visible and enabled.
 */
export const clickByCtId = (ctId: string): ClickResult => {
  const g = globalThis as Record<string, unknown>;
  if (typeof g['__name'] !== 'function') g['__name'] = (f: unknown) => f;
  const fail = (reason: string): ClickResult => ({ clicked: false, atPageMs: Math.round(performance.now()), reason });
  if (!/^ct-\d+$/.test(ctId)) return fail('invalid_candidate_id');
  const el = document.querySelector(`[data-ct-id="${ctId}"]`);
  if (!(el instanceof HTMLElement)) return fail('candidate_not_found');
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  if (rect.width < 2 || rect.height < 2 || style.display === 'none' || style.visibility === 'hidden') {
    return fail('candidate_not_visible');
  }
  if ((el as HTMLButtonElement).disabled) return fail('candidate_disabled');
  // Timestamp BEFORE dispatching: consent handlers often fire tracking requests
  // synchronously inside the click, and those must count as post-action activity
  // (rules compare atMs > action.atMs). The 1ms bias guards ms-rounding ties.
  const atPageMs = Math.floor(performance.now()) - 1;
  el.click();
  return { clicked: true, atPageMs, reason: null };
};
