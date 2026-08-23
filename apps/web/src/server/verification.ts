/**
 * Domain verification (spec §10): proves control of a scan target before high
 * scan volume. Methods: DNS TXT record, HTML meta tag, well-known file.
 * All page fetches are SSRF-validated first — verification must never become
 * an internal-network probe. Resolvers/fetchers are injectable for tests.
 */
import { randomBytes } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { registrableDomain } from '@consenttrace/shared';
import { validateScanUrl } from '@consenttrace/validation';
import { audit } from './audit';
import { sql } from './db';
import { HttpError } from './http';

export const TXT_PREFIX = 'consenttrace-verify=';
export const META_NAME = 'consenttrace-verification';
export const WELL_KNOWN_PATH = '/.well-known/consenttrace-verify.txt';

export type VerificationMethod = 'dns_txt' | 'html_meta' | 'file';

export type TxtResolver = (domain: string) => Promise<string[][]>;
export type PageFetcher = (url: string) => Promise<string>;

const FETCH_TIMEOUT_MS = 10000;
const FETCH_MAX_BYTES = 512 * 1024;

/** SSRF-validated, size- and time-capped fetch of a public page. */
export const safePageFetch: PageFetcher = async (url) => {
  const verdict = await validateScanUrl(url);
  if (!verdict.ok) throw new HttpError(400, verdict.code ?? 'INVALID_TARGET_URL', verdict.reason ?? 'URL rejected.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'ConsentTrace-Verify/1.0' } });
    const reader = res.body?.getReader();
    if (!reader) return '';
    let received = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > FETCH_MAX_BYTES) {
        void reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
};

export function newVerificationToken(): string {
  return randomBytes(16).toString('hex');
}

export async function checkDnsTxt(host: string, token: string, resolver: TxtResolver = resolveTxt): Promise<boolean> {
  const domain = registrableDomain(host);
  let records: string[][];
  try {
    records = await resolver(domain);
  } catch {
    return false;
  }
  return records.some((parts) => {
    const joined = parts.join('');
    return joined === TXT_PREFIX + token || joined === token;
  });
}

export function metaTagPresent(html: string, token: string): boolean {
  // Conservative match: a meta tag carrying our name and the exact token.
  const pattern = new RegExp(
    `<meta[^>]+name=["']${META_NAME}["'][^>]+content=["']${token}["']|<meta[^>]+content=["']${token}["'][^>]+name=["']${META_NAME}["']`,
    'i',
  );
  return pattern.test(html);
}

export async function checkHtmlMeta(url: string, token: string, fetcher: PageFetcher = safePageFetch): Promise<boolean> {
  try {
    return metaTagPresent(await fetcher(url), token);
  } catch {
    return false;
  }
}

export async function checkWellKnownFile(originUrl: string, token: string, fetcher: PageFetcher = safePageFetch): Promise<boolean> {
  try {
    const origin = new URL(originUrl).origin;
    const body = await fetcher(origin + WELL_KNOWN_PATH);
    return body.trim() === token;
  } catch {
    return false;
  }
}

export interface VerifyDeps {
  resolver?: TxtResolver;
  fetcher?: PageFetcher;
}

export async function verifySiteDomain(
  opts: { siteId: string; orgId: string; userId: string; method: VerificationMethod },
  deps: VerifyDeps = {},
): Promise<{ verified: boolean }> {
  const rows = await sql`select id, primary_url, verification_token from sites where id = ${opts.siteId} and organization_id = ${opts.orgId}`;
  const site = rows[0];
  if (!site) throw new HttpError(404, 'NOT_FOUND', 'Site not found.');
  let token = site['verification_token'] as string | null;
  if (!token) {
    token = newVerificationToken();
    await sql`update sites set verification_token = ${token} where id = ${opts.siteId}`;
  }
  const url = site['primary_url'] as string;
  const host = new URL(url).hostname;

  let ok = false;
  if (opts.method === 'dns_txt') ok = await checkDnsTxt(host, token, deps.resolver ?? resolveTxt);
  else if (opts.method === 'html_meta') ok = await checkHtmlMeta(url, token, deps.fetcher ?? safePageFetch);
  else ok = await checkWellKnownFile(url, token, deps.fetcher ?? safePageFetch);

  if (!ok) return { verified: false };
  await sql`update sites set verified_domain = ${registrableDomain(host)}, verification_method = ${opts.method},
    verified_at = now(), verified_by = ${opts.userId}, updated_at = now() where id = ${opts.siteId}`;
  await audit(opts.orgId, opts.userId, 'domain_verified', 'site', opts.siteId, { method: opts.method });
  return { verified: true };
}

/** Unverified sites are capped per month (spec: volume requires verification). */
export function unverifiedMonthlyCap(): number {
  return Number(process.env.CT_UNVERIFIED_SITE_MONTHLY_CAP ?? 10);
}

export async function assertVerificationAllowsScan(siteEnvironmentId: string): Promise<void> {
  const rows = await sql`
    select s.verified_at, count(sc.id)::int as month_scans
    from site_environments se
    join sites s on s.id = se.site_id
    left join scans sc on sc.site_environment_id = se.id and sc.created_at >= date_trunc('month', now())
    where se.id = ${siteEnvironmentId}
    group by s.verified_at`;
  const row = rows[0];
  if (!row) return;
  if (row['verified_at'] === null && (row['month_scans'] as number) >= unverifiedMonthlyCap()) {
    throw new HttpError(
      403,
      'VERIFICATION_REQUIRED',
      `Unverified sites are limited to ${unverifiedMonthlyCap()} scans per month. Verify domain ownership (DNS TXT, meta tag, or well-known file) to continue.`,
    );
  }
}
