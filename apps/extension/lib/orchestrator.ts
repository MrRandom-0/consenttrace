/**
 * Async flows composing the chrome facade, shared collector and pure evidence
 * logic. All flows dispatch into the session reducer so the timeline reflects
 * every step in real time.
 */
import {
  CMP_SIGNATURES,
  GENERIC_CONSENT_KEYWORDS,
  classifyConsentControl,
  collectConsentSurfaces,
  collectStorage,
  selectActionCandidate,
  type InpageDetection,
} from '@consenttrace/scanner-core';
import type { CMPDetection } from '@consenttrace/shared';
import { captureVisible, execInTab, getCookiesForUrl, reloadTabAndWait, requestOriginPermission } from './chromex';
import {
  buildCookieObservations,
  buildStorageObservations,
  classifyResources,
  summarizeSession,
  synthesizeFindings,
} from './evidence';
import { sha256Hex } from './hash';
import { computeDelta, getPreviousSummary, saveSummary } from './history';
import { captureResources, clickByCtId } from './inject';
import type { SessionMsg } from './session';
import type { CandidateWithClassification, PanelSnapshot, QuickSession, SnapshotKey } from './types';

export type Dispatch = (msg: SessionMsg) => void;

const DETECT_ARGS = {
  signatures: CMP_SIGNATURES.map((s) => ({ provider: s.provider, selectors: s.selectors, apis: s.apis })),
  keywords: GENERIC_CONSENT_KEYWORDS,
  maxCandidates: 40,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toCmp(detection: InpageDetection): CMPDetection {
  const selectorMatched = detection.signatureMatches.some((m) => m.kind === 'selector_match');
  return {
    detected: detection.containerFound,
    ...(detection.containerProvider ? { provider: detection.containerProvider } : {}),
    confidence: detection.containerFound ? (selectorMatched ? 0.95 : detection.usedGenericHeuristic ? 0.6 : 0.7) : 0,
    evidence: [
      ...detection.signatureMatches.map((m) => ({ kind: m.kind, detail: `${m.provider}: ${m.detail}` })),
      ...(detection.usedGenericHeuristic
        ? [{ kind: 'keyword_heuristic' as const, detail: 'Generic overlay heuristic (keywords + controls + positioning)' }]
        : []),
    ],
    bannerText: detection.bannerText,
    candidateCount: detection.candidates.length,
  };
}

function toCandidates(detection: InpageDetection): CandidateWithClassification[] {
  return detection.candidates.map((control) => ({
    control,
    classification: classifyConsentControl(control.text, control.ariaLabel),
  }));
}

async function captureSnapshot(session: QuickSession, bannerVisible: boolean | null): Promise<PanelSnapshot> {
  const pageHost = new URL(session.url).hostname;
  const [rawCookies, rawStorage, rawResources] = await Promise.all([
    getCookiesForUrl(session.url),
    execInTab(session.tabId, collectStorage, [] as []),
    execInTab(session.tabId, captureResources, [] as []),
  ]);
  const [cookies, storage] = await Promise.all([
    buildCookieObservations(rawCookies, pageHost, 'after_settle'),
    buildStorageObservations(rawStorage, 'after_settle'),
  ]);
  return {
    cookies,
    storage,
    resources: classifyResources(rawResources, pageHost),
    bannerVisible,
    atEpoch: Date.now(),
    atPageMs: rawResources.nowMs,
  };
}

async function addScreenshot(dispatch: Dispatch, session: QuickSession, label: string): Promise<void> {
  const dataUrl = await captureVisible(session.windowId);
  if (!dataUrl) return;
  dispatch({
    kind: 'SCREENSHOT',
    item: {
      label,
      dataUrl,
      atMs: Date.now() - session.startedAtEpoch,
      sha256: await sha256Hex(dataUrl),
    },
  });
}

async function refreshFindings(dispatch: Dispatch, session: QuickSession): Promise<void> {
  const { findings, observations } = synthesizeFindings(session);
  dispatch({ kind: 'FINDINGS', findings, observations });
}

async function persistHistory(dispatch: Dispatch, session: QuickSession): Promise<void> {
  const summary = summarizeSession(session);
  const previous = await getPreviousSummary(session.origin);
  if (previous) dispatch({ kind: 'HISTORY', previous, delta: computeDelta(previous, summary) });
  await saveSummary(summary);
}

/** Read latest session state after dispatches — the caller supplies a getter. */
export type GetSession = () => QuickSession;

export async function runQuickCheck(dispatch: Dispatch, getSession: GetSession): Promise<void> {
  const session = getSession();
  try {
    dispatch({ kind: 'STATUS', status: 'awaiting_permission' });
    dispatch({ kind: 'EVENT', type: 'permission_request', description: `Requesting access to ${session.origin}` });
    const granted = await requestOriginPermission(session.url);
    dispatch({ kind: 'PERMISSION', granted });
    if (!granted) {
      dispatch({ kind: 'STATUS', status: 'idle' });
      return;
    }

    dispatch({ kind: 'STATUS', status: 'inspecting' });
    const detection = await execInTab(session.tabId, collectConsentSurfaces, [DETECT_ARGS]);
    dispatch({ kind: 'DETECTION', cmp: toCmp(detection), candidates: toCandidates(detection) });

    const snapshot = await captureSnapshot(session, detection.containerFound ? detection.containerVisible : null);
    dispatch({ kind: 'SNAPSHOT', key: 'baseline', snapshot });
    await addScreenshot(dispatch, getSession(), detection.containerVisible ? 'Consent banner visible' : 'Current page state');

    await refreshFindings(dispatch, getSession());
    await persistHistory(dispatch, getSession());
    dispatch({ kind: 'STATUS', status: 'ready' });
  } catch (err) {
    dispatch({ kind: 'ERROR', code: 'INSPECTION_FAILED', message: (err as Error).message.slice(0, 200) });
  }
}

export async function performGuidedAction(
  dispatch: Dispatch,
  getSession: GetSession,
  kind: 'accept_all' | 'reject_all',
  settleMs: number,
): Promise<void> {
  const session = getSession();
  try {
    dispatch({ kind: 'STATUS', status: 'acting' });
    // Re-inspect right before clicking: the DOM may have changed since Quick
    // Check, and clicking must target a control the detector saw just now.
    const detection = await execInTab(session.tabId, collectConsentSurfaces, [DETECT_ARGS]);
    dispatch({ kind: 'DETECTION', cmp: toCmp(detection), candidates: toCandidates(detection) });
    const selected = selectActionCandidate(detection.candidates, kind, 'medium');
    if (!selected) {
      dispatch({
        kind: 'EVENT',
        type: 'action_not_found',
        description: `No ${kind === 'reject_all' ? 'reject' : 'accept'}-style control found — no click performed (structured observation: ${kind === 'reject_all' ? 'reject' : 'accept'}_action_not_found).`,
      });
      dispatch({ kind: 'STATUS', status: 'ready' });
      await refreshFindings(dispatch, getSession());
      return;
    }

    await addScreenshot(dispatch, getSession(), `Before ${kind === 'reject_all' ? 'reject' : 'accept'} click`);
    const click = await execInTab(session.tabId, clickByCtId, [selected.candidate.ctId]);
    if (!click.clicked) {
      dispatch({ kind: 'ERROR', code: 'ACTION_CLICK_FAILED', message: click.reason ?? 'Click failed' });
      return;
    }
    dispatch({
      kind: 'ACTION',
      action: {
        kind,
        buttonText: selected.candidate.text || selected.candidate.ariaLabel || '',
        confidence: selected.classification.confidence,
        mode: 'guided',
        atPageMs: click.atPageMs,
        atEpoch: Date.now(),
      },
    });
    await addScreenshot(dispatch, getSession(), `After ${kind === 'reject_all' ? 'reject' : 'accept'} click`);

    dispatch({ kind: 'EVENT', type: 'settle', description: `Waiting ${settleMs} ms for tags to settle` });
    await sleep(settleMs);
    const snapshot = await captureSnapshot(getSession(), null);
    dispatch({ kind: 'SNAPSHOT', key: 'afterAction', snapshot });
    await refreshFindings(dispatch, getSession());
    await persistHistory(dispatch, getSession());
    dispatch({ kind: 'STATUS', status: 'ready' });
  } catch (err) {
    dispatch({ kind: 'ERROR', code: 'ACTION_FAILED', message: (err as Error).message.slice(0, 200) });
  }
}

/** Manual mode: the user interacted with the banner themselves. */
export async function captureChanges(dispatch: Dispatch, getSession: GetSession): Promise<void> {
  try {
    dispatch({ kind: 'STATUS', status: 'inspecting' });
    dispatch({ kind: 'EVENT', type: 'manual_capture', description: 'Capturing state after manual interaction' });
    const session = getSession();
    const detection = await execInTab(session.tabId, collectConsentSurfaces, [DETECT_ARGS]);
    const snapshot = await captureSnapshot(session, detection.containerFound ? detection.containerVisible : null);
    dispatch({ kind: 'SNAPSHOT', key: 'afterAction', snapshot });
    await addScreenshot(dispatch, getSession(), 'After manual interaction');
    await refreshFindings(dispatch, getSession());
    await persistHistory(dispatch, getSession());
    dispatch({ kind: 'STATUS', status: 'ready' });
  } catch (err) {
    dispatch({ kind: 'ERROR', code: 'CAPTURE_FAILED', message: (err as Error).message.slice(0, 200) });
  }
}

/** Reload the page and verify the consent choice persists (banner should not return). */
export async function checkPersistence(dispatch: Dispatch, getSession: GetSession, settleMs: number): Promise<void> {
  const session = getSession();
  try {
    dispatch({ kind: 'STATUS', status: 'reloading' });
    dispatch({ kind: 'EVENT', type: 'reload', description: 'Reloading page to test consent persistence' });
    const ok = await reloadTabAndWait(session.tabId);
    if (!ok) {
      dispatch({ kind: 'ERROR', code: 'RELOAD_FAILED', message: 'The page did not finish reloading.' });
      return;
    }
    await sleep(Math.min(settleMs, 2000));
    const detection = await execInTab(session.tabId, collectConsentSurfaces, [DETECT_ARGS]);
    const bannerVisible = detection.containerFound && detection.containerVisible;
    const snapshot = await captureSnapshot(getSession(), bannerVisible);
    dispatch({ kind: 'SNAPSHOT', key: 'afterReload', snapshot });
    dispatch({
      kind: 'EVENT',
      type: 'persistence_check',
      description: bannerVisible
        ? 'Consent banner visible again after reload — the preference may not persist'
        : 'Consent banner not shown after reload — preference persisted',
    });
    await addScreenshot(dispatch, getSession(), 'After reload (persistence check)');
    await refreshFindings(dispatch, getSession());
    dispatch({ kind: 'STATUS', status: 'ready' });
  } catch (err) {
    dispatch({ kind: 'ERROR', code: 'PERSISTENCE_CHECK_FAILED', message: (err as Error).message.slice(0, 200) });
  }
}
