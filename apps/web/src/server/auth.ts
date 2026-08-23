/**
 * Credentials auth + DB-backed sessions (self-hosted mode; Supabase Auth is the
 * managed-mode equivalent — docs/AUTHORIZATION.md). Passwords: scrypt (N=16384,
 * r=8, p=1). Session tokens: 256-bit random, stored as sha256 — raw tokens
 * never touch the database. Cookies: httpOnly, SameSite=Lax, Secure in prod.
 */
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';
import { sql, type MembershipRow, type UserRow } from './db';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;
const SCRYPT_N = 16384;
const SESSION_COOKIE = 'ct_session';
const SESSION_TTL_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = (await scrypt(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 })) as Buffer;
  return `scrypt:${SCRYPT_N}:8:1:${salt.toString('base64')}:${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64!, 'base64');
  const key = (await scrypt(password, Buffer.from(saltB64!, 'base64'), expected.length, {
    N: Number(nStr),
    r: Number(rStr),
    p: Number(pStr),
  })) as Buffer;
  return key.length === expected.length && timingSafeEqual(key, expected);
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000);
  await sql`insert into sessions (user_id, token_hash, expires_at) values (${userId}, ${tokenHash(token)}, ${expiresAt})`;
  return { token, expiresAt };
}

export async function destroySession(token: string): Promise<void> {
  await sql`delete from sessions where token_hash = ${tokenHash(token)}`;
}

export interface AuthContext {
  user: Pick<UserRow, 'id' | 'email' | 'name'>;
  org: MembershipRow;
}

export async function getAuthFromToken(token: string | undefined): Promise<AuthContext | null> {
  if (!token) return null;
  const rows = await sql<Array<UserRow & { session_expires: string }>>`
    select u.id, u.email, u.name, u.password_hash, s.expires_at as session_expires
    from sessions s join users u on u.id = s.user_id
    where s.token_hash = ${tokenHash(token)} and s.expires_at > now()
    limit 1`;
  const user = rows[0];
  if (!user) return null;
  const orgs = await sql<MembershipRow[]>`
    select o.id, o.name, o.slug, o.plan, m.role
    from organization_members m join organizations o on o.id = m.organization_id
    where m.user_id = ${user.id}
    order by m.joined_at asc
    limit 1`;
  const org = orgs[0];
  if (!org) return null;
  return { user: { id: user.id, email: user.email, name: user.name }, org };
}

export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  return getAuthFromToken(store.get(SESSION_COOKIE)?.value);
}

export function sessionCookie(token: string, expiresAt: Date) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  };
}

export function clearedSessionCookie() {
  return { ...sessionCookie('', new Date(0)), value: '' };
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
