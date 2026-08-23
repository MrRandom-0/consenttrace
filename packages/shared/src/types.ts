/**
 * Core domain types shared across web, worker, extension and packages.
 * These mirror docs/DATA_MODEL.md and packages/database migrations.
 */

export type ScenarioType =
  | 'no_action'
  | 'accept_all'
  | 'reject_all'
  | 'essential_only'
  | 'custom_preferences'
  | 'withdraw_consent';

/** Phases at which cookie/storage snapshots are captured. */
export type SnapshotPhase =
  | 'before_page'
  | 'after_page_load'
  | 'before_consent_action'
  | 'immediately_after_action'
  | 'after_settle'
  | 'after_reload';

export type CookieCategory =
  | 'strictly_necessary'
  | 'functional'
  | 'analytics'
  | 'advertising'
  | 'unknown';

export type ClassificationSource =
  | 'known_signature'
  | 'organization_override'
  | 'ai_suggested'
  | 'unclassified';

export type RequestCategory =
  | 'analytics'
  | 'advertising'
  | 'personalization'
  | 'functional'
  | 'cdn'
  | 'security'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type ConsentActionType =
  | 'accept_all'
  | 'reject_all'
  | 'manage_preferences'
  | 'save_preferences'
  | 'necessary_only'
  | 'close'
  | 'withdraw'
  | 'unknown';

export type ScenarioStatus = 'completed' | 'completed_with_observations' | 'failed' | 'skipped';

/** A cookie as observed at a snapshot phase. Raw values are never stored — only a hash. */
export interface CookieObservation {
  name: string;
  domain: string;
  path: string;
  /** sha256 of the raw value, truncated. Enables change detection without storing values. */
  valueHash: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'unspecified';
  /** True when the cookie has no expiry (session cookie). */
  session: boolean;
  /** ISO timestamp when the cookie expires, if not a session cookie. */
  expiresAt: string | null;
  firstParty: boolean;
  category: CookieCategory;
  classificationSource: ClassificationSource;
  vendor: string | null;
  phase: SnapshotPhase;
  capturedAt: string;
}

export interface StorageObservation {
  kind: 'localStorage' | 'sessionStorage';
  key: string;
  valueHash: string;
  valueLength: number;
  phase: SnapshotPhase;
  capturedAt: string;
}

export interface NetworkObservation {
  /** origin + pathname only. Query strings and fragments are stripped (privacy-preserving normalization). */
  urlNormalized: string;
  domain: string;
  method: string;
  resourceType: string;
  /** ms offset from scenario start. */
  atMs: number;
  timestamp: string;
  requestCategory: RequestCategory;
  vendor: string | null;
  thirdParty: boolean;
  blocked: boolean;
  status: number | null;
}

export interface ConsentActionRecord {
  type: ConsentActionType;
  buttonText: string;
  selectorStrategy: 'known_cmp_selector' | 'deterministic_text_match' | 'ai_suggested';
  elementRole: string | null;
  interactionAt: string;
  /** ms offset from scenario start. */
  atMs: number;
  confidence: Confidence;
  screenshotBeforeEvidenceId: string | null;
  screenshotAfterEvidenceId: string | null;
}

export interface DetectionEvidence {
  kind: 'selector_match' | 'api_present' | 'keyword_heuristic' | 'ai_suggested';
  detail: string;
}

export interface CMPDetection {
  detected: boolean;
  provider?: string;
  confidence: number;
  evidence: DetectionEvidence[];
  bannerText?: string;
  candidateCount?: number;
}

export type EvidenceType =
  | 'screenshot'
  | 'cookie_snapshot'
  | 'storage_snapshot'
  | 'network_log'
  | 'consent_timeline'
  | 'html_snippet'
  | 'json_manifest'
  | 'report';

export interface EvidenceItem {
  id: string;
  scenario: ScenarioType | null;
  type: EvidenceType;
  /** Path relative to the scan output root. */
  artifactPath: string;
  sha256: string;
  bytes: number;
  createdAt: string;
  label: string;
}

export interface TimelineEvent {
  scenario: ScenarioType;
  /** ms offset from scenario start. */
  atMs: number;
  at: string;
  type: string;
  description: string;
  evidenceId?: string;
}

export type FindingStatus = 'open' | 'acknowledged' | 'resolved' | 'ignored';
export type RuleResultStatus = 'pass' | 'finding' | 'not_applicable' | 'error';

export interface RuleResult {
  ruleId: string;
  ruleVersion: string;
  name: string;
  severity: Severity;
  status: RuleResultStatus;
  scenario: ScenarioType | null;
  title: string;
  /** What the browser actually observed — facts only. */
  observation: string;
  expectedBehavior: string;
  actualBehavior: string;
  evidenceIds: string[];
  regression: boolean;
  metadata: Record<string, unknown>;
}

export interface ScenarioResult {
  scenario: ScenarioType;
  status: ScenarioStatus;
  startedAt: string;
  durationMs: number;
  cmp: CMPDetection;
  consentAction: ConsentActionRecord | null;
  /** Structured machine-readable observations, e.g. reject_action_not_found. */
  observations: string[];
  cookies: Partial<Record<SnapshotPhase, CookieObservation[]>>;
  storage: Partial<Record<SnapshotPhase, StorageObservation[]>>;
  network: NetworkObservation[];
  /** Whether the consent banner was visible again after reload (persistence check). */
  bannerAfterReload: boolean | null;
  screenshots: Partial<Record<string, string>>;
  /** Evidence IDs by label, e.g. cookies_after_settle, network_log — used by rule findings. */
  evidenceRefs: Partial<Record<string, string>>;
  timeline: TimelineEvent[];
  failureCode: string | null;
}

export interface EvidenceManifest {
  scanId: string;
  scannerVersion: string;
  createdAt: string;
  artifacts: EvidenceItem[];
  /** sha256 over the canonical JSON of `artifacts`. Tamper-evident, not legally certified. */
  manifestSha256: string;
}

export interface ScanResult {
  scanId: string;
  url: string;
  finalUrl: string | null;
  triggerType: 'manual_extension' | 'manual_cloud' | 'scheduled' | 'api' | 'ci';
  status: 'completed' | 'failed';
  startedAt: string;
  completedAt: string;
  scannerVersion: string;
  rulePackVersion: string;
  browser: { name: string; version: string };
  viewport: { width: number; height: number };
  locale: string;
  timezoneId: string | null;
  regionProfile: string | null;
  scenarios: ScenarioResult[];
  findings: RuleResult[];
  evidence: EvidenceManifest | null;
  baselineScanId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
}

/** Organization-level cookie classification override. Takes priority over signatures. */
export interface CookieOverride {
  /** Exact cookie name or regex source (when isRegex). */
  pattern: string;
  isRegex?: boolean;
  category: CookieCategory;
  vendor?: string;
  note?: string;
}

/** Organization-level domain classification override. */
export interface DomainOverride {
  /** Domain suffix match, e.g. "tracker.example.com" matches itself and subdomains. */
  domain: string;
  category: RequestCategory;
  vendor?: string;
  note?: string;
}
