/**
 * Public /v1 API keys. Tokens are `ct_live_<40 hex>` — returned exactly once at
 * creation and stored only as sha256. Keys carry a scope (read | write) and are
 * gated on the organization's `apiAccess` entitlement at BOTH creation and use
 * (a downgraded plan disables existing keys without deleting them).
 */
import { createHash, randomBytes } from 'node:crypto';
import { sql, type MembershipRow } from './db';
import { entitlementsFor } from './entitlements';
import { HttpError } from './http';

export type ApiKeyScope = 'read' | 'write';

export interface ApiKeyRow {
  id: string;
  organization_id: string;
  name: string;
  token_prefix: string;
  scope: ApiKeyScope;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createApiKey(opts: {
  orgId: string;
  userId: string;
  name: string;
  scope: ApiKeyScope;
  plan: string;
}): Promise<{ key: ApiKeyRow; token: string }> {
  if (!entitlementsFor(opts.plan).apiAccess) {
    throw new HttpError(402, 'PLAN_LIMIT', 'API access requires the Agency plan or above.');
  }
  const token = 'ct_live_' + randomBytes(20).toString('hex');
  const rows = await sql<ApiKeyRow[]>`
    insert into api_keys (organization_id, name, token_hash, token_prefix, scope, created_by)
    values (${opts.orgId}, ${opts.name}, ${hash(token)}, ${token.slice(0, 12)}, ${opts.scope}, ${opts.userId})
    returning id, organization_id, name, token_prefix, scope, created_at, last_used_at, revoked_at`;
  return { key: rows[0]!, token };
}

export async function listApiKeys(orgId: string): Promise<ApiKeyRow[]> {
  return sql<ApiKeyRow[]>`
    select id, organization_id, name, token_prefix, scope, created_at, last_used_at, revoked_at
    from api_keys where organization_id = ${orgId} order by created_at desc`;
}

export async function revokeApiKey(orgId: string, keyId: string): Promise<boolean> {
  const rows = await sql`update api_keys set revoked_at = now()
    where id = ${keyId} and organization_id = ${orgId} and revoked_at is null returning id`;
  return rows.length > 0;
}

export interface ApiAuthContext {
  keyId: string;
  scope: ApiKeyScope;
  org: MembershipRow; // role is synthetic for API calls (analyst-equivalent capabilities via scope)
}

/** Authenticate a /v1 request from its Authorization: Bearer header. */
export async function requireApiKey(req: Request, needed: ApiKeyScope = 'read'): Promise<ApiAuthContext> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('ct_live_') || token.length < 20) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Provide an API key via "Authorization: Bearer ct_live_…".');
  }
  const rows = await sql`
    select k.id as key_id, k.scope, k.revoked_at, k.last_used_at,
           o.id, o.name, o.slug, o.plan
    from api_keys k join organizations o on o.id = k.organization_id
    where k.token_hash = ${hash(token)}
    limit 1`;
  const row = rows[0];
  if (!row) throw new HttpError(401, 'UNAUTHENTICATED', 'Unknown API key.');
  if (row['revoked_at']) throw new HttpError(401, 'KEY_REVOKED', 'This API key has been revoked.');
  if (!entitlementsFor(row['plan'] as string).apiAccess) {
    throw new HttpError(402, 'PLAN_LIMIT', 'API access is not included in the current plan.');
  }
  const scope = row['scope'] as ApiKeyScope;
  if (needed === 'write' && scope !== 'write') {
    throw new HttpError(403, 'SCOPE', 'This API key is read-only.');
  }
  // Throttled last-used stamp (at most once a minute per key) — avoids hot-path writes.
  const lastUsed = row['last_used_at'] ? new Date(row['last_used_at'] as string).getTime() : 0;
  if (Date.now() - lastUsed > 60000) {
    void sql`update api_keys set last_used_at = now() where id = ${row['key_id']}`.catch(() => {});
  }
  return {
    keyId: row['key_id'] as string,
    scope,
    org: { id: row['id'], name: row['name'], slug: row['slug'], plan: row['plan'], role: 'analyst' } as MembershipRow,
  };
}
