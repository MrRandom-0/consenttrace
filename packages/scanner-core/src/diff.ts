/** Snapshot diff utilities used by rules and the regression engine. */
import type { CookieObservation, NetworkObservation } from '@consenttrace/shared';

export function cookieKey(c: Pick<CookieObservation, 'name' | 'domain' | 'path'>): string {
  return `${c.name}|${c.domain.replace(/^\./, '')}|${c.path}`;
}

export interface CookieDiff {
  added: CookieObservation[];
  removed: CookieObservation[];
  changed: Array<{ before: CookieObservation; after: CookieObservation; changedFields: string[] }>;
}

export function diffCookies(before: CookieObservation[], after: CookieObservation[]): CookieDiff {
  const beforeMap = new Map(before.map((c) => [cookieKey(c), c]));
  const afterMap = new Map(after.map((c) => [cookieKey(c), c]));
  const added = after.filter((c) => !beforeMap.has(cookieKey(c)));
  const removed = before.filter((c) => !afterMap.has(cookieKey(c)));
  const changed: CookieDiff['changed'] = [];
  for (const [key, b] of beforeMap) {
    const a = afterMap.get(key);
    if (!a) continue;
    const fields: string[] = [];
    if (a.valueHash !== b.valueHash) fields.push('value');
    if (a.secure !== b.secure) fields.push('secure');
    if (a.httpOnly !== b.httpOnly) fields.push('httpOnly');
    if (a.sameSite !== b.sameSite) fields.push('sameSite');
    if (a.session !== b.session) fields.push('session');
    if (fields.length > 0) changed.push({ before: b, after: a, changedFields: fields });
  }
  return { added, removed, changed };
}

export function uniqueDomains(network: NetworkObservation[]): string[] {
  return [...new Set(network.map((n) => n.domain))].sort();
}

export function trackingDomains(network: NetworkObservation[]): string[] {
  return [
    ...new Set(
      network.filter((n) => n.requestCategory === 'analytics' || n.requestCategory === 'advertising').map((n) => n.domain),
    ),
  ].sort();
}

export function setDiff<T>(before: Iterable<T>, after: Iterable<T>): { added: T[]; removed: T[] } {
  const b = new Set(before);
  const a = new Set(after);
  return {
    added: [...a].filter((x) => !b.has(x)),
    removed: [...b].filter((x) => !a.has(x)),
  };
}
