import { describe, expect, it } from 'vitest';
import { createNavigationGuard, isBlockedAddress, validateScanUrl } from '@consenttrace/validation';

const publicResolver = async () => ['93.184.216.34'];

describe('validateScanUrl — protocol & shape', () => {
  it('rejects non-http protocols', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'data:text/html,hi', 'chrome://settings']) {
      const r = await validateScanUrl(url);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('INVALID_TARGET_URL');
    }
  });
  it('rejects credentials in URL', async () => {
    const r = await validateScanUrl('https://admin:secret@example.com/');
    expect(r.ok).toBe(false);
  });
  it('rejects unparseable URLs', async () => {
    expect((await validateScanUrl('not a url')).ok).toBe(false);
  });
});

describe('validateScanUrl — network locations', () => {
  it('blocks localhost and .localhost/.internal suffixes', async () => {
    for (const url of ['http://localhost/', 'http://api.localhost/', 'http://db.internal/', 'http://printer.local/']) {
      const r = await validateScanUrl(url);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('SSRF_BLOCKED');
    }
  });
  it('blocks loopback, private, link-local and metadata IP literals', async () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://10.0.0.5/',
      'http://192.168.1.10/',
      'http://172.20.3.4/',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.64.1.1/',
      'http://0.0.0.0/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://[::ffff:127.0.0.1]/',
    ]) {
      const r = await validateScanUrl(url);
      expect(r.ok, url).toBe(false);
      expect(r.code, url).toBe('SSRF_BLOCKED');
    }
  });
  it('blocks single-label internal service names', async () => {
    const r = await validateScanUrl('http://intranet/');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SSRF_BLOCKED');
  });
  it('blocks restricted ports', async () => {
    const r = await validateScanUrl('https://example.com:8080/', { resolver: publicResolver });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SSRF_BLOCKED');
  });
  it('allows configured extra ports', async () => {
    const r = await validateScanUrl('https://example.com:8443/', { resolver: publicResolver, allowedPorts: [80, 443, 8443] });
    expect(r.ok).toBe(true);
  });
  it('resolves DNS and blocks when ANY address is private (rebinding defense)', async () => {
    const r = await validateScanUrl('https://evil.example.com/', {
      resolver: async () => ['93.184.216.34', '10.0.0.1'],
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('SSRF_BLOCKED');
  });
  it('allows public hosts', async () => {
    const r = await validateScanUrl('https://example.com/page', { resolver: publicResolver });
    expect(r.ok).toBe(true);
    expect(r.resolvedAddresses).toEqual(['93.184.216.34']);
  });
  it('allowPrivateTargets (dev/test) permits loopback but still enforces protocol rules', async () => {
    expect((await validateScanUrl('http://127.0.0.1:4300/site', { allowPrivateTargets: true })).ok).toBe(true);
    expect((await validateScanUrl('file:///etc/passwd', { allowPrivateTargets: true })).ok).toBe(false);
  });
});

describe('isBlockedAddress', () => {
  it('classifies correctly', () => {
    expect(isBlockedAddress('8.8.8.8')).toBe(false);
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
    expect(isBlockedAddress('2606:4700::1111')).toBe(false);
    expect(isBlockedAddress('fd12:3456::1')).toBe(true);
  });
});

describe('createNavigationGuard', () => {
  it('enforces redirect limits and revalidates every hop', async () => {
    const guard = createNavigationGuard({ resolver: publicResolver, maxRedirects: 2 });
    expect((await guard.check('https://example.com/', false)).allowed).toBe(true);
    expect((await guard.check('https://example.com/a', true)).allowed).toBe(true);
    expect((await guard.check('http://169.254.169.254/', true)).allowed).toBe(false);
    expect((await guard.check('https://example.com/b', true)).allowed).toBe(false); // over limit
  });
});
