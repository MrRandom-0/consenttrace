/** Extension-local session model. Mirrors shared domain types where possible. */
import type {
  CMPDetection,
  CookieObservation,
  RequestCategory,
  RuleResult,
  StorageObservation,
} from '@consenttrace/shared';
import type { ActionClassification, CandidateControl } from '@consenttrace/scanner-core';

export interface ClassifiedResource {
  /** origin + pathname; query stripped (privacy normalization, same as worker). */
  urlNormalized: string;
  domain: string;
  initiatorType: string;
  /** Page-relative ms (performance timeline) — comparable with action atPageMs. */
  startMs: number;
  category: RequestCategory;
  vendor: string | null;
  thirdParty: boolean;
}

export interface PanelSnapshot {
  cookies: CookieObservation[];
  storage: StorageObservation[];
  resources: ClassifiedResource[];
  bannerVisible: boolean | null;
  atEpoch: number;
  atPageMs: number;
}

export type SnapshotKey = 'baseline' | 'afterAction' | 'afterReload';

export interface PanelEvent {
  /** ms offset from session start (wall clock). */
  atMs: number;
  type: string;
  description: string;
}

export interface ScreenshotItem {
  label: string;
  dataUrl: string;
  atMs: number;
  sha256: string | null;
}

export interface SessionActionRecord {
  kind: 'accept_all' | 'reject_all';
  buttonText: string;
  confidence: 'high' | 'medium' | 'low';
  mode: 'guided' | 'manual';
  atPageMs: number;
  atEpoch: number;
}

export type SessionStatus =
  | 'idle'
  | 'unsupported'
  | 'need_gesture'
  | 'awaiting_permission'
  | 'inspecting'
  | 'ready'
  | 'acting'
  | 'reloading'
  | 'error';

export interface CandidateWithClassification {
  control: CandidateControl;
  classification: ActionClassification;
}

export interface SessionSummary {
  origin: string;
  atEpoch: number;
  cookieCount: number;
  trackingCookieNames: string[];
  trackingDomains: string[];
  cmpProvider: string | null;
  findingCount: number;
}

export interface HistoryDelta {
  newTrackingCookies: string[];
  removedTrackingCookies: string[];
  newTrackingDomains: string[];
  removedTrackingDomains: string[];
}

export interface QuickSession {
  id: string;
  tabId: number;
  windowId: number;
  url: string;
  origin: string;
  title: string;
  startedAtEpoch: number;
  status: SessionStatus;
  permissionGranted: boolean;
  cmp: CMPDetection | null;
  candidates: CandidateWithClassification[];
  snapshots: Partial<Record<SnapshotKey, PanelSnapshot>>;
  action: SessionActionRecord | null;
  timeline: PanelEvent[];
  screenshots: ScreenshotItem[];
  findings: RuleResult[];
  observations: string[];
  history: { previous: SessionSummary; delta: HistoryDelta } | null;
  error: { code: string; message: string } | null;
  demo: boolean;
}
