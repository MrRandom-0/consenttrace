/** Shared /v1 plumbing: per-key rate limits and keyset pagination cursors. */
import { HttpError, rateLimit } from './http';
import type { ApiAuthContext } from './apikeys';

export function v1RateLimit(ctx: ApiAuthContext): void {
  rateLimit(`v1:${ctx.keyId}`, 120, 60000); // 120 requests/minute/key
}

export interface Cursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, 'utf8').toString('base64url');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Postgres timestamptz text format (microsecond-precision) — JS Date round-trips
// truncate to milliseconds and silently skip rows, so cursors carry the raw text.
const PG_TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/;

export function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const [createdAt, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
    if (!createdAt || !id || !UUID_RE.test(id) || !PG_TS_RE.test(createdAt)) {
      throw new Error('bad cursor');
    }
    return { createdAt, id };
  } catch {
    throw new HttpError(400, 'INVALID_CURSOR', 'The cursor parameter is not valid.');
  }
}
