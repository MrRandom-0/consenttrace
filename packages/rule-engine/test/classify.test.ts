import { describe, expect, it } from 'vitest';
import { classifyCookie, classifyDomain } from '@consenttrace/rule-engine';

describe('classifyCookie', () => {
  it('classifies known signatures', () => {
    expect(classifyCookie('_ga', 'example.com')).toMatchObject({ category: 'analytics', source: 'known_signature', vendor: 'Google Analytics' });
    expect(classifyCookie('_ga_ABC123', 'example.com')).toMatchObject({ category: 'analytics' });
    expect(classifyCookie('_fbp', 'example.com')).toMatchObject({ category: 'advertising', vendor: 'Meta Pixel' });
    expect(classifyCookie('session_id', 'example.com')).toMatchObject({ category: 'strictly_necessary' });
    expect(classifyCookie('OptanonConsent', 'example.com')).toMatchObject({ category: 'strictly_necessary', vendor: 'OneTrust' });
  });
  it('respects domain-gated signatures', () => {
    expect(classifyCookie('IDE', '.doubleclick.net')).toMatchObject({ category: 'advertising' });
    expect(classifyCookie('IDE', 'example.com')).toMatchObject({ category: 'unknown', source: 'unclassified' });
  });
  it('never guesses: unmatched cookies are unknown, not advertising', () => {
    expect(classifyCookie('totally_custom_cookie', 'example.com')).toMatchObject({ category: 'unknown', source: 'unclassified', vendor: null });
  });
  it('organization overrides beat signatures', () => {
    const r = classifyCookie('_ga', 'example.com', [{ pattern: '_ga', category: 'strictly_necessary', vendor: 'Internal' }]);
    expect(r).toMatchObject({ category: 'strictly_necessary', source: 'organization_override', vendor: 'Internal' });
  });
  it('supports regex overrides', () => {
    const r = classifyCookie('fx_pref_theme', 'example.com', [{ pattern: '^fx_pref_', isRegex: true, category: 'functional' }]);
    expect(r).toMatchObject({ category: 'functional', source: 'organization_override' });
  });
});

describe('classifyDomain', () => {
  it('classifies known suffixes including subdomains', () => {
    expect(classifyDomain('www.google-analytics.com')).toMatchObject({ category: 'analytics' });
    expect(classifyDomain('stats.g.doubleclick.net')).toMatchObject({ category: 'advertising' });
    expect(classifyDomain('px.ads.linkedin.com')).toMatchObject({ category: 'advertising', vendor: 'LinkedIn Insight' });
    expect(classifyDomain('fonts.gstatic.com')).toMatchObject({ category: 'cdn' });
  });
  it('unknown domains stay unknown', () => {
    expect(classifyDomain('cdn.some-shop-asset.example')).toMatchObject({ category: 'unknown', source: 'unclassified' });
  });
  it('organization overrides beat signatures', () => {
    const r = classifyDomain('cdn.fxtracker.example', [{ domain: 'cdn.fxtracker.example', category: 'advertising', vendor: 'Fixture Ads' }]);
    expect(r).toMatchObject({ category: 'advertising', source: 'organization_override' });
  });
});
