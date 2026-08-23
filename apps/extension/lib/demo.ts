/**
 * Demo session for design preview, store screenshots and non-extension
 * contexts (?demo=1). Data is clearly synthetic and never mixed with real
 * captures — `demo: true` disables all capture actions in the UI.
 */
import type { CookieObservation, RuleResult } from '@consenttrace/shared';
import { CT_001, CT_002, CT_003, CT_005, CT_007, evaluateRules } from '@consenttrace/rule-engine';
import { classifyConsentControl } from '@consenttrace/scanner-core';
import { synthesizeFindings } from './evidence';
import { freshSession } from './session';
import type { ClassifiedResource, PanelSnapshot, QuickSession } from './types';

void CT_001; void CT_002; void CT_003; void CT_005; void CT_007; void evaluateRules;

const cookie = (
  name: string,
  category: CookieObservation['category'],
  vendor: string | null,
  firstParty = true,
): CookieObservation => ({
  name,
  domain: 'demo-shop.example',
  path: '/',
  valueHash: 'sha256:d3m0aaaaaaaaaaaaaaaaaaaa',
  secure: true,
  httpOnly: false,
  sameSite: 'Lax',
  session: false,
  expiresAt: new Date(Date.now() + 180 * 86400000).toISOString(),
  firstParty,
  category,
  classificationSource: category === 'unknown' ? 'unclassified' : 'known_signature',
  vendor,
  phase: 'after_settle',
  capturedAt: new Date().toISOString(),
});

const resource = (domain: string, category: ClassifiedResource['category'], vendor: string, startMs: number): ClassifiedResource => ({
  urlNormalized: `https://${domain}/collect`,
  domain,
  initiatorType: 'img',
  startMs,
  category,
  vendor,
  thirdParty: true,
});

export function buildDemoSession(): QuickSession {
  const base = freshSession({
    tabId: 0,
    windowId: 0,
    url: 'https://demo-shop.example/collections/all',
    origin: 'https://demo-shop.example',
    title: 'Demo Shop — Outdoor gear for every season',
    status: 'ready',
    permissionGranted: true,
    demo: true,
  });

  const baseline: PanelSnapshot = {
    cookies: [
      cookie('session_id', 'strictly_necessary', 'Platform session'),
      cookie('_ga', 'analytics', 'Google Analytics'),
      cookie('_gid', 'analytics', 'Google Analytics'),
      cookie('_fbp', 'advertising', 'Meta Pixel'),
      cookie('shop_currency', 'unknown', null),
    ],
    storage: [
      { kind: 'localStorage', key: 'cart_id', valueHash: 'sha256:d3m0bbbbbbbbbbbbbbbbbbbb', valueLength: 24, phase: 'after_settle', capturedAt: new Date().toISOString() },
      { kind: 'localStorage', key: 'consent_ui_seen', valueHash: 'sha256:d3m0cccccccccccccccccccc', valueLength: 4, phase: 'after_settle', capturedAt: new Date().toISOString() },
    ],
    resources: [
      resource('www.google-analytics.com', 'analytics', 'Google Analytics', 1240),
      resource('connect.facebook.net', 'advertising', 'Meta Pixel', 1418),
      resource('cdn.jsdelivr.net', 'cdn', 'jsDelivr', 310),
    ],
    bannerVisible: true,
    atEpoch: Date.now() - 12000,
    atPageMs: 2100,
  };

  const afterAction: PanelSnapshot = {
    ...baseline,
    resources: [...baseline.resources, resource('connect.facebook.net', 'advertising', 'Meta Pixel', 5480)],
    bannerVisible: false,
    atEpoch: Date.now() - 5000,
    atPageMs: 6400,
  };

  const afterReload: PanelSnapshot = { ...afterAction, bannerVisible: false, atEpoch: Date.now() - 1500, atPageMs: 1900 };

  let session: QuickSession = {
    ...base,
    startedAtEpoch: Date.now() - 14000,
    cmp: {
      detected: true,
      confidence: 0.6,
      evidence: [{ kind: 'keyword_heuristic', detail: 'Generic overlay heuristic (keywords + controls + positioning)' }],
      bannerText: 'We use cookies to personalise content and ads and to analyse our traffic. You can accept all cookies or reject non-essential cookies.',
      candidateCount: 3,
    },
    candidates: [
      { control: { ctId: 'ct-0', tag: 'button', role: null, text: 'Cookie settings', ariaLabel: null, visible: true, enabled: true }, classification: classifyConsentControl('Cookie settings') },
      { control: { ctId: 'ct-1', tag: 'button', role: null, text: 'Reject all', ariaLabel: null, visible: true, enabled: true }, classification: classifyConsentControl('Reject all') },
      { control: { ctId: 'ct-2', tag: 'button', role: null, text: 'Accept all', ariaLabel: null, visible: true, enabled: true }, classification: classifyConsentControl('Accept all') },
    ],
    snapshots: { baseline, afterAction, afterReload },
    action: {
      kind: 'reject_all',
      buttonText: 'Reject all',
      confidence: 'high',
      mode: 'guided',
      atPageMs: 3120,
      atEpoch: Date.now() - 9000,
    },
    history: {
      previous: {
        origin: 'https://demo-shop.example',
        atEpoch: Date.now() - 6 * 86400000,
        cookieCount: 3,
        trackingCookieNames: [],
        trackingDomains: [],
        cmpProvider: 'custom',
        findingCount: 0,
      },
      delta: {
        newTrackingCookies: ['_ga', '_gid', '_fbp'],
        removedTrackingCookies: [],
        newTrackingDomains: ['www.google-analytics.com', 'connect.facebook.net'],
        removedTrackingDomains: [],
      },
    },
  };

  const events: Array<[number, string, string]> = [
    [0, 'permission_request', 'Requesting access to https://demo-shop.example'],
    [180, 'permission_granted', 'Access granted for https://demo-shop.example'],
    [420, 'banner_detected', 'Consent banner detected (custom banner) · 3 control(s)'],
    [640, 'snapshot', 'Snapshot (baseline): 5 cookie(s), 2 storage key(s), 2 tracking request(s) observed'],
    [890, 'screenshot', 'Screenshot captured — Consent banner visible'],
    [1120, 'rules_evaluated', 'Deterministic rules evaluated — 1 finding(s)'],
    [3120, 'consent_action', 'Clicked “Reject all” (reject_all, high confidence)'],
    [3340, 'screenshot', 'Screenshot captured — After reject click'],
    [6350, 'snapshot', 'Snapshot (afterAction): 5 cookie(s), 2 storage key(s), 3 tracking request(s) observed'],
    [6520, 'tracking_request', 'Request to connect.facebook.net (advertising, Meta Pixel) after rejection'],
    [9800, 'reload', 'Reloading page to test consent persistence'],
    [11600, 'persistence_check', 'Consent banner not shown after reload — preference persisted'],
    [11840, 'rules_evaluated', 'Deterministic rules evaluated — 3 finding(s)'],
  ];
  session = { ...session, timeline: events.map(([atMs, type, description]) => ({ atMs, type, description })) };

  const { findings, observations } = synthesizeFindings(session);
  const demoFindings: RuleResult[] = findings;
  return { ...session, findings: demoFindings, observations };
}
