import { describe, expect, it } from 'vitest';
import { freshSession, sessionReducer, type SessionMsg } from '../lib/session';
import type { PanelSnapshot } from '../lib/types';

const init: SessionMsg = {
  kind: 'INIT',
  tabId: 7,
  windowId: 1,
  url: 'https://shop.example/products',
  title: 'Shop',
  supported: true,
};

const snapshot = (bannerVisible: boolean | null): PanelSnapshot => ({
  cookies: [],
  storage: [],
  resources: [],
  bannerVisible,
  atEpoch: Date.now(),
  atPageMs: 1000,
});

describe('sessionReducer', () => {
  it('INIT derives origin and supported status', () => {
    const s = sessionReducer(freshSession(), init);
    expect(s.origin).toBe('https://shop.example');
    expect(s.status).toBe('idle');
    expect(s.tabId).toBe(7);
  });
  it('INIT with unsupported page sets unsupported status', () => {
    const s = sessionReducer(freshSession(), { ...init, url: 'chrome://settings', supported: false });
    expect(s.status).toBe('unsupported');
  });
  it('PERMISSION appends a timeline event and records the grant', () => {
    let s = sessionReducer(freshSession(), init);
    s = sessionReducer(s, { kind: 'PERMISSION', granted: true });
    expect(s.permissionGranted).toBe(true);
    expect(s.timeline.at(-1)?.type).toBe('permission_granted');
  });
  it('SNAPSHOT stores by key and narrates counts', () => {
    let s = sessionReducer(freshSession(), init);
    s = sessionReducer(s, { kind: 'SNAPSHOT', key: 'baseline', snapshot: snapshot(true) });
    expect(s.snapshots.baseline?.bannerVisible).toBe(true);
    expect(s.timeline.at(-1)?.description).toContain('baseline');
  });
  it('ACTION and FINDINGS narrate correctly', () => {
    let s = sessionReducer(freshSession(), init);
    s = sessionReducer(s, {
      kind: 'ACTION',
      action: { kind: 'reject_all', buttonText: 'Reject all', confidence: 'high', mode: 'guided', atPageMs: 1200, atEpoch: Date.now() },
    });
    expect(s.action?.kind).toBe('reject_all');
    expect(s.timeline.at(-1)?.description).toContain('Reject all');
    s = sessionReducer(s, { kind: 'FINDINGS', findings: [], observations: [] });
    expect(s.timeline.at(-1)?.description).toContain('no findings');
  });
  it('ERROR sets status and preserves evidence; RESET keeps page identity', () => {
    let s = sessionReducer(freshSession(), init);
    s = sessionReducer(s, { kind: 'SNAPSHOT', key: 'baseline', snapshot: snapshot(null) });
    s = sessionReducer(s, { kind: 'ERROR', code: 'ACTION_CLICK_FAILED', message: 'nope' });
    expect(s.status).toBe('error');
    expect(s.snapshots.baseline).toBeDefined();
    const reset = sessionReducer(s, { kind: 'RESET' });
    expect(reset.origin).toBe('https://shop.example');
    expect(reset.snapshots.baseline).toBeUndefined();
    expect(reset.status).toBe('idle');
  });
});
