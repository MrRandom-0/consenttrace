/** Session state machine (pure reducer — unit-tested without chrome APIs). */
import type { CMPDetection, RuleResult } from '@consenttrace/shared';
import type {
  CandidateWithClassification,
  HistoryDelta,
  PanelEvent,
  PanelSnapshot,
  QuickSession,
  ScreenshotItem,
  SessionActionRecord,
  SessionStatus,
  SessionSummary,
  SnapshotKey,
} from './types';

export type SessionMsg =
  | {
      kind: 'INIT';
      tabId: number;
      windowId: number;
      url: string;
      title: string;
      supported: boolean;
      demo?: boolean;
      preGranted?: boolean;
    }
  | { kind: 'STATUS'; status: SessionStatus }
  | { kind: 'EVENT'; type: string; description: string }
  | { kind: 'PERMISSION'; granted: boolean }
  | { kind: 'DETECTION'; cmp: CMPDetection; candidates: CandidateWithClassification[] }
  | { kind: 'SNAPSHOT'; key: SnapshotKey; snapshot: PanelSnapshot }
  | { kind: 'SCREENSHOT'; item: ScreenshotItem }
  | { kind: 'ACTION'; action: SessionActionRecord }
  | { kind: 'FINDINGS'; findings: RuleResult[]; observations: string[] }
  | { kind: 'HISTORY'; previous: SessionSummary; delta: HistoryDelta }
  | { kind: 'ERROR'; code: string; message: string }
  | { kind: 'RESET' };

export function freshSession(partial?: Partial<QuickSession>): QuickSession {
  return {
    id: 'qc_' + Math.random().toString(36).slice(2, 10),
    tabId: -1,
    windowId: -1,
    url: '',
    origin: '',
    title: '',
    startedAtEpoch: Date.now(),
    status: 'idle',
    permissionGranted: false,
    cmp: null,
    candidates: [],
    snapshots: {},
    action: null,
    timeline: [],
    screenshots: [],
    findings: [],
    observations: [],
    history: null,
    error: null,
    demo: false,
    ...partial,
  };
}

function withEvent(session: QuickSession, type: string, description: string): QuickSession {
  const event: PanelEvent = { atMs: Date.now() - session.startedAtEpoch, type, description };
  return { ...session, timeline: [...session.timeline, event] };
}

export function sessionReducer(session: QuickSession, msg: SessionMsg): QuickSession {
  switch (msg.kind) {
    case 'INIT': {
      let origin = '';
      try {
        origin = new URL(msg.url).origin;
      } catch {
        /* unsupported url */
      }
      return freshSession({
        tabId: msg.tabId,
        windowId: msg.windowId,
        url: msg.url,
        origin,
        title: msg.title,
        status: msg.supported ? 'idle' : 'unsupported',
        demo: msg.demo ?? false,
        permissionGranted: msg.preGranted ?? false,
      });
    }
    case 'STATUS':
      return { ...session, status: msg.status };
    case 'EVENT':
      return withEvent(session, msg.type, msg.description);
    case 'PERMISSION': {
      const next = { ...session, permissionGranted: msg.granted };
      return withEvent(
        next,
        msg.granted ? 'permission_granted' : 'permission_denied',
        msg.granted ? `Access granted for ${session.origin}` : 'Site access was not granted — nothing was captured.',
      );
    }
    case 'DETECTION': {
      const next = { ...session, cmp: msg.cmp, candidates: msg.candidates };
      const label = msg.cmp.detected
        ? `Consent banner detected${msg.cmp.provider ? ` (${msg.cmp.provider})` : ' (custom banner)'} · ${msg.candidates.length} control(s)`
        : 'No consent banner detected on the current page state';
      return withEvent(next, msg.cmp.detected ? 'banner_detected' : 'banner_not_detected', label);
    }
    case 'SNAPSHOT': {
      const next = { ...session, snapshots: { ...session.snapshots, [msg.key]: msg.snapshot } };
      const tracking = msg.snapshot.resources.filter(
        (r) => r.category === 'analytics' || r.category === 'advertising',
      ).length;
      return withEvent(
        next,
        'snapshot',
        `Snapshot (${msg.key}): ${msg.snapshot.cookies.length} cookie(s), ${msg.snapshot.storage.length} storage key(s), ${tracking} tracking request(s) observed`,
      );
    }
    case 'SCREENSHOT':
      return withEvent(
        { ...session, screenshots: [...session.screenshots, msg.item] },
        'screenshot',
        `Screenshot captured — ${msg.item.label}`,
      );
    case 'ACTION':
      return withEvent(
        { ...session, action: msg.action },
        'consent_action',
        `Clicked “${msg.action.buttonText}” (${msg.action.kind}, ${msg.action.confidence} confidence)`,
      );
    case 'FINDINGS': {
      const findingCount = msg.findings.filter((f) => f.status === 'finding').length;
      const next = { ...session, findings: msg.findings, observations: msg.observations };
      return withEvent(
        next,
        'rules_evaluated',
        findingCount === 0
          ? 'Deterministic rules evaluated — no findings during this check'
          : `Deterministic rules evaluated — ${findingCount} finding(s)`,
      );
    }
    case 'HISTORY':
      return { ...session, history: { previous: msg.previous, delta: msg.delta } };
    case 'ERROR':
      return withEvent(
        { ...session, status: 'error', error: { code: msg.code, message: msg.message } },
        'error',
        `${msg.code}: ${msg.message}`,
      );
    case 'RESET':
      return freshSession({
        tabId: session.tabId,
        windowId: session.windowId,
        url: session.url,
        origin: session.origin,
        title: session.title,
        status: 'idle',
        demo: session.demo,
      });
    default:
      return session;
  }
}
