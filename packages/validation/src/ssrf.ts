/**
 * SSRF defense for the scan worker. Scanner URLs are hostile input.
 * See docs/SECURITY.md and docs/THREAT_MODEL.md.
 *
 * Policy:
 *  - http/https only; no credentials in URL
 *  - restricted ports (80/443 by default)
 *  - hostname must contain a dot (blocks bare internal service names) unless an IP literal
 *  - explicit blocklist of localhost/metadata hostnames
 *  - IP literals AND every DNS-resolved address checked against private/reserved ranges
 *  - every redirect must be revalidated (createNavigationGuard), bounded redirect count
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { FailureCode } from '@consenttrace/shared';

export interface SsrfPolicy {
  /** DEV/TEST ONLY. Allows loopback/private targets for fixture scanning. */
  allowPrivateTargets?: boolean;
  /** Ports allowed in target URLs. Defaults to 80 and 443. */
  allowedPorts?: number[];
  /** Injectable resolver for tests. Returns all addresses for a hostname. */
  resolver?: (hostname: string) => Promise<string[]>;
  maxRedirects?: number;
}

export interface UrlValidationResult {
  ok: boolean;
  code?: FailureCode;
  reason?: string;
  resolvedAddresses?: string[];
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.googleapis.internal',
  'instance-data',
]);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.localdomain'];

function ipv4ToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  return (((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!) >>> 0;
}

function inCidr4(ip: number, base: string, maskBits: number): boolean {
  const baseInt = ipv4ToInt(base);
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ip & mask) === (baseInt & mask);
}

const PRIVATE_V4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],        // "this network"
  ['10.0.0.0', 8],       // private
  ['100.64.0.0', 10],    // CGNAT
  ['127.0.0.0', 8],      // loopback
  ['169.254.0.0', 16],   // link-local (cloud metadata 169.254.169.254 lives here)
  ['172.16.0.0', 12],    // private
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.168.0.0', 16],   // private
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved + broadcast
];

/** True when the IP (v4 or v6) is loopback, private, link-local, reserved or otherwise non-public. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const ip = ipv4ToInt(address);
    return PRIVATE_V4_RANGES.some(([base, bits]) => inCidr4(ip, base, bits));
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // IPv4-mapped / IPv4-translated → recurse on the embedded v4.
    // Covers both dotted (::ffff:127.0.0.1) and normalized hex (::ffff:7f00:1) forms —
    // URL parsers normalize to the hex form.
    const v4Mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? lower.match(/^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/);
    if (v4Mapped?.[1]) return isBlockedAddress(v4Mapped[1]);
    const v4MappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (v4MappedHex) {
      const hi = parseInt(v4MappedHex[1]!, 16);
      const lo = parseInt(v4MappedHex[2]!, 16);
      return isBlockedAddress(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`);
    }
    if (lower === '::' || lower === '::1') return true;        // unspecified, loopback
    if (lower.startsWith('fe80:') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true; // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    if (lower.startsWith('ff')) return true;                   // multicast
    return false;
  }
  // Not a literal IP.
  return false;
}

async function defaultResolver(hostname: string): Promise<string[]> {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

/**
 * Validate a scan target URL. DNS is resolved BEFORE navigation and every
 * resolved address is checked, mitigating DNS-based SSRF.
 */
export async function validateScanUrl(raw: string, policy: SsrfPolicy = {}): Promise<UrlValidationResult> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, code: 'INVALID_TARGET_URL', reason: 'URL could not be parsed.' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, code: 'INVALID_TARGET_URL', reason: `Protocol ${url.protocol} is not allowed. Only http/https.` };
  }
  if (url.username || url.password) {
    return { ok: false, code: 'INVALID_TARGET_URL', reason: 'Credentials embedded in URLs are not allowed.' };
  }

  // DEV/TEST ONLY escape hatch for fixture scanning. Protocol and credential
  // checks above still apply; host/port restrictions are skipped.
  if (policy.allowPrivateTargets) {
    return { ok: true, resolvedAddresses: [] };
  }

  const allowedPorts = policy.allowedPorts ?? [80, 443];
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.includes(port)) {
    return { ok: false, code: 'SSRF_BLOCKED', reason: `Port ${port} is not in the allowed port list.` };
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  const lowerHost = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lowerHost) || BLOCKED_HOST_SUFFIXES.some((s) => lowerHost.endsWith(s))) {
    return { ok: false, code: 'SSRF_BLOCKED', reason: `Hostname ${hostname} is blocked.` };
  }

  if (isIP(hostname)) {
    if (isBlockedAddress(hostname)) {
      return { ok: false, code: 'SSRF_BLOCKED', reason: `IP ${hostname} is in a blocked range.` };
    }
    return { ok: true, resolvedAddresses: [hostname] };
  }

  // Bare single-label hostnames are internal service names — blocked.
  if (!lowerHost.includes('.')) {
    return { ok: false, code: 'SSRF_BLOCKED', reason: 'Single-label hostnames are not allowed.' };
  }

  const resolver = policy.resolver ?? defaultResolver;
  let addresses: string[];
  try {
    addresses = await resolver(hostname);
  } catch {
    return { ok: false, code: 'NAVIGATION_FAILED', reason: `DNS resolution failed for ${hostname}.` };
  }
  if (addresses.length === 0) {
    return { ok: false, code: 'NAVIGATION_FAILED', reason: `No addresses resolved for ${hostname}.` };
  }
  const blocked = addresses.find((a) => isBlockedAddress(a));
  if (blocked) {
    return { ok: false, code: 'SSRF_BLOCKED', reason: `${hostname} resolves to blocked address ${blocked}.` };
  }
  return { ok: true, resolvedAddresses: addresses };
}

export interface NavigationGuard {
  /** Validate a navigation (including redirects). Returns block reason or null when allowed. */
  check(url: string, isRedirect: boolean): Promise<{ allowed: boolean; reason?: string }>;
  redirectCount(): number;
}

/** Stateful guard used by the worker to revalidate every navigation/redirect. */
export function createNavigationGuard(policy: SsrfPolicy = {}): NavigationGuard {
  const maxRedirects = policy.maxRedirects ?? 10;
  let redirects = 0;
  return {
    async check(url: string, isRedirect: boolean) {
      if (isRedirect) {
        redirects += 1;
        if (redirects > maxRedirects) {
          return { allowed: false, reason: `Redirect limit of ${maxRedirects} exceeded.` };
        }
      }
      const result = await validateScanUrl(url, policy);
      if (!result.ok) return { allowed: false, reason: result.reason };
      return { allowed: true };
    },
    redirectCount: () => redirects,
  };
}
