import { describe, expect, it } from 'vitest';
import { isFirstParty, matchesDomainSuffix, registrableDomain } from '@consenttrace/shared';

describe('registrableDomain', () => {
  it('handles simple and multi-label suffixes', () => {
    expect(registrableDomain('www.example.com')).toBe('example.com');
    expect(registrableDomain('a.b.shop.co.uk')).toBe('shop.co.uk');
    expect(registrableDomain('example.com')).toBe('example.com');
  });
});

describe('isFirstParty', () => {
  it('treats subdomains and dot-prefixed cookie domains as first-party', () => {
    expect(isFirstParty('site.fixture.test', '.site.fixture.test')).toBe(true);
    expect(isFirstParty('www.example.com', 'cdn.example.com')).toBe(true);
  });
  it('treats other registrable domains as third-party', () => {
    expect(isFirstParty('site.fixture.test', 'cdn.fxtracker.example')).toBe(false);
    expect(isFirstParty('example.com', 'example.org')).toBe(false);
  });
});

describe('matchesDomainSuffix', () => {
  it('matches exact and subdomain, not partial labels', () => {
    expect(matchesDomainSuffix('doubleclick.net', 'doubleclick.net')).toBe(true);
    expect(matchesDomainSuffix('stats.g.doubleclick.net', 'doubleclick.net')).toBe(true);
    expect(matchesDomainSuffix('notdoubleclick.net', 'doubleclick.net')).toBe(false);
  });
});
