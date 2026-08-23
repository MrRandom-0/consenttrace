/**
 * Registrable-domain helpers used for first-party vs third-party decisions.
 * Uses a small embedded multi-label public-suffix list; a full PSL integration
 * is tracked for later (documented in docs/DATA_MODEL.md limitations).
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'org.nz',
  'co.jp', 'ne.jp', 'or.jp', 'co.kr', 'com.br', 'com.mx',
  'com.ar', 'co.in', 'co.za', 'com.sg', 'com.hk', 'com.tr',
]);

/** Best-effort eTLD+1 ("registrable domain") for a hostname. */
export function registrableDomain(hostname: string): string {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_LABEL_SUFFIXES.has(lastTwo) && labels.length >= 3) {
    return labels.slice(-3).join('.');
  }
  return lastTwo;
}

/** True when `candidate` (a request host or cookie domain) is first-party relative to the page host. */
export function isFirstParty(pageHost: string, candidate: string): boolean {
  const c = candidate.replace(/^\./, '');
  return registrableDomain(pageHost) === registrableDomain(c);
}

/** True when `host` equals `suffix` or is a subdomain of it. */
export function matchesDomainSuffix(host: string, suffix: string): boolean {
  const h = host.toLowerCase().replace(/^\./, '');
  const s = suffix.toLowerCase().replace(/^\./, '');
  return h === s || h.endsWith('.' + s);
}
