import { describe, expect, it, vi } from 'vitest';
import { checkDnsTxt, checkHtmlMeta, checkWellKnownFile, metaTagPresent, safePageFetch, TXT_PREFIX } from '../src/server/verification';

const TOKEN = 'ab12cd34ef56ab12cd34ef56ab12cd34';

describe('checkDnsTxt', () => {
  it('matches prefixed and bare tokens on the registrable domain', async () => {
    const resolver = vi.fn(async () => [['other=1'], [TXT_PREFIX + TOKEN]]);
    expect(await checkDnsTxt('www.shop.example.com', TOKEN, resolver)).toBe(true);
    expect(resolver).toHaveBeenCalledWith('example.com');
    expect(await checkDnsTxt('shop.example.com', TOKEN, async () => [[TOKEN]])).toBe(true);
  });
  it('fails on missing records or resolver errors', async () => {
    expect(await checkDnsTxt('example.com', TOKEN, async () => [['nope']])).toBe(false);
    expect(await checkDnsTxt('example.com', TOKEN, async () => { throw new Error('NXDOMAIN'); })).toBe(false);
  });
});

describe('metaTagPresent / checkHtmlMeta', () => {
  it('matches both attribute orders, rejects other tokens', () => {
    expect(metaTagPresent(`<head><meta name="consenttrace-verification" content="${TOKEN}"></head>`, TOKEN)).toBe(true);
    expect(metaTagPresent(`<meta content="${TOKEN}" name='consenttrace-verification'>`, TOKEN)).toBe(true);
    expect(metaTagPresent(`<meta name="consenttrace-verification" content="wrong">`, TOKEN)).toBe(false);
  });
  it('uses the injected fetcher', async () => {
    const fetcher = vi.fn(async () => `<html><meta name="consenttrace-verification" content="${TOKEN}"></html>`);
    expect(await checkHtmlMeta('https://example.com/', TOKEN, fetcher)).toBe(true);
  });
});

describe('checkWellKnownFile', () => {
  it('fetches the origin well-known path and trims the body', async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe('https://example.com/.well-known/consenttrace-verify.txt');
      return `  ${TOKEN}\n`;
    });
    expect(await checkWellKnownFile('https://example.com/some/page?x=1', TOKEN, fetcher)).toBe(true);
  });
});

describe('safePageFetch SSRF posture', () => {
  it('refuses private/internal targets before any network I/O', async () => {
    for (const url of ['http://127.0.0.1/x', 'http://169.254.169.254/latest', 'http://intranet/', 'file:///etc/passwd']) {
      await expect(safePageFetch(url)).rejects.toMatchObject({ status: 400 });
    }
  });
});
