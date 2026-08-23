import { describe, expect, it } from 'vitest';
import { classifyConsentControl, selectActionCandidate, type CandidateControl } from '@consenttrace/scanner-core';

describe('classifyConsentControl', () => {
  it('classifies accept variants', () => {
    expect(classifyConsentControl('Accept all')).toMatchObject({ action: 'accept_all', confidence: 'high' });
    expect(classifyConsentControl('Allow all cookies')).toMatchObject({ action: 'accept_all', confidence: 'high' });
    expect(classifyConsentControl('Tout accepter')).toMatchObject({ action: 'accept_all', confidence: 'high' });
    expect(classifyConsentControl('Alle akzeptieren')).toMatchObject({ action: 'accept_all', confidence: 'high' });
    expect(classifyConsentControl('I Agree')).toMatchObject({ action: 'accept_all', confidence: 'high' });
  });
  it('classifies reject variants including negated-accept phrasing', () => {
    expect(classifyConsentControl('Reject all')).toMatchObject({ action: 'reject_all', confidence: 'high' });
    expect(classifyConsentControl('Do not accept')).toMatchObject({ action: 'reject_all', confidence: 'high' });
    expect(classifyConsentControl('Continue without accepting')).toMatchObject({ action: 'reject_all', confidence: 'high' });
    expect(classifyConsentControl('I do not agree to this')).toMatchObject({ action: 'reject_all' });
    expect(classifyConsentControl('Tout refuser')).toMatchObject({ action: 'reject_all', confidence: 'high' });
    expect(classifyConsentControl('Decline optional cookies')).toMatchObject({ action: 'reject_all' });
  });
  it('never classifies "Do not accept" as accept', () => {
    expect(classifyConsentControl('Do not accept').action).not.toBe('accept_all');
  });
  it('classifies necessary-only before accept keywords', () => {
    expect(classifyConsentControl('Only necessary')).toMatchObject({ action: 'necessary_only', confidence: 'high' });
    expect(classifyConsentControl('Use necessary cookies only')).toMatchObject({ action: 'necessary_only' });
    expect(classifyConsentControl('Allow essential cookies only')).toMatchObject({ action: 'necessary_only' });
  });
  it('classifies manage/save/withdraw/close', () => {
    expect(classifyConsentControl('Cookie settings')).toMatchObject({ action: 'manage_preferences', confidence: 'high' });
    expect(classifyConsentControl('Save preferences')).toMatchObject({ action: 'save_preferences', confidence: 'high' });
    expect(classifyConsentControl('Allow selection')).toMatchObject({ action: 'save_preferences', confidence: 'high' });
    expect(classifyConsentControl('Withdraw consent')).toMatchObject({ action: 'withdraw', confidence: 'high' });
    expect(classifyConsentControl('', 'Close')).toMatchObject({ action: 'close' });
  });
  it('ambiguous dismissals are low confidence, unknown stays unknown', () => {
    expect(classifyConsentControl('OK')).toMatchObject({ action: 'accept_all', confidence: 'low' });
    expect(classifyConsentControl('Browse the collection')).toMatchObject({ action: 'unknown' });
  });
});

describe('selectActionCandidate', () => {
  const make = (ctId: string, text: string, visible = true, enabled = true): CandidateControl => ({
    ctId, tag: 'button', role: null, text, ariaLabel: null, visible, enabled,
  });
  const banner = [make('ct-0', 'Cookie settings'), make('ct-1', 'Reject all'), make('ct-2', 'Accept all')];

  it('selects the correct control for each desired action', () => {
    expect(selectActionCandidate(banner, 'reject_all')?.candidate.ctId).toBe('ct-1');
    expect(selectActionCandidate(banner, 'accept_all')?.candidate.ctId).toBe('ct-2');
    expect(selectActionCandidate(banner, 'manage_preferences')?.candidate.ctId).toBe('ct-0');
  });
  it('returns null when no reject exists (reject_action_not_found path)', () => {
    expect(selectActionCandidate([make('ct-0', 'Accept all'), make('ct-1', 'Close')], 'reject_all')).toBeNull();
  });
  it('ignores invisible/disabled candidates', () => {
    expect(selectActionCandidate([make('ct-0', 'Reject all', false)], 'reject_all')).toBeNull();
    expect(selectActionCandidate([make('ct-0', 'Reject all', true, false)], 'reject_all')).toBeNull();
  });
  it('refuses low-confidence matches at default minimum (no silent risky clicks)', () => {
    expect(selectActionCandidate([make('ct-0', 'OK')], 'accept_all')).toBeNull();
    expect(selectActionCandidate([make('ct-0', 'OK')], 'accept_all', 'low')?.candidate.ctId).toBe('ct-0');
  });
});
