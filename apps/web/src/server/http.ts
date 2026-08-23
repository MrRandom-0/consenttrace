/** Route-handler helpers: validation, auth/RBAC gates, CSRF origin check, rate limiting. */
import type { ZodSchema } from 'zod';
import { getAuth, type AuthContext } from './auth';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export function handleError(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, { status: err.status });
  }
  console.error('[api] unhandled error', err);
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, { status: 500 });
}

export async function readJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body must be JSON.');
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, 'VALIDATION', `${first?.path.join('.') || 'body'}: ${first?.message ?? 'invalid'}`);
  }
  return parsed.data;
}

/** CSRF defense for cookie-authed mutations: Origin (when present) must match Host. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser client (API keys arrive in Phase 3)
  const host = req.headers.get('host');
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, 'BAD_ORIGIN', 'Cross-origin request rejected.');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, 'BAD_ORIGIN', 'Cross-origin request rejected.');
  }
}

export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw new HttpError(401, 'UNAUTHENTICATED', 'Sign in required.');
  return auth;
}

const ROLE_RANK = { viewer: 0, analyst: 1, admin: 2, owner: 3 } as const;
export type Role = keyof typeof ROLE_RANK;

export function requireRole(auth: AuthContext, minimum: Role): void {
  if (ROLE_RANK[auth.org.role] < ROLE_RANK[minimum]) {
    throw new HttpError(403, 'FORBIDDEN', `This action requires the ${minimum} role.`);
  }
}

// ── Simple in-memory rate limiter (per instance; production adds a shared store) ──
const buckets = new Map<string, { count: number; resetAt: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Try again shortly.');
  }
}

export function clientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
}
