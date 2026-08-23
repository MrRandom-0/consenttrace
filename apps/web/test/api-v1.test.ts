/**
 * Public /v1 API integration tests: real Postgres, real route handlers invoked
 * with real Request objects. Covers key lifecycle + hashing, plan gating,
 * scope enforcement, idempotent scan creation, and keyset pagination.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 5437;
const DSN = `postgres://ct:ct@127.0.0.1:${PORT}/ct_api_test`;
const MIGRATE = fileURLToPath(new URL('../../../packages/database/scripts/migrate.mjs', import.meta.url));

/* eslint-disable @typescript-eslint/no-explicit-any */
let pg: any;
let db: typeof import('../src/server/db');
let apikeys: typeof import('../src/server/apikeys');
let sitesRoute: typeof import('../src/app/api/v1/sites/route');
let scansRoute: typeof import('../src/app/api/v1/scans/route');
let scanDetailRoute: typeof import('../src/app/api/v1/scans/[id]/route');
let baselinesRoute: typeof import('../src/app/api/v1/baselines/route');

let orgId = '';
let userId = '';
let writeToken = '';
let readToken = '';
let envId = '';

const request = (path: string, opts: { method?: string; token?: string; body?: unknown; headers?: Record<string, string> } = {}) =>
  new Request(`http://localhost${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.headers ?? {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });

const jsonOf = async (res: Response) => (await res.json()) as any;

beforeAll(async () => {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = await mkdtemp(join(tmpdir(), 'ct-api-pg-'));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'ct', password: 'ct', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ct_api_test');
  const migrate = spawnSync('node', [MIGRATE], { env: { ...process.env, DATABASE_URL: DSN }, encoding: 'utf8' });
  if (migrate.status !== 0) throw new Error('migrations failed: ' + migrate.stderr);

  process.env['DATABASE_URL'] = DSN;
  db = await import('../src/server/db');
  apikeys = await import('../src/server/apikeys');
  sitesRoute = await import('../src/app/api/v1/sites/route');
  scansRoute = await import('../src/app/api/v1/scans/route');
  scanDetailRoute = await import('../src/app/api/v1/scans/[id]/route');
  baselinesRoute = await import('../src/app/api/v1/baselines/route');

  const [user] = await db.sql`insert into users (email, name) values ('api@test.dev', 'API') returning id`;
  const [org] = await db.sql`insert into organizations (name, slug, plan) values ('API Org', 'api-org', 'agency') returning id`;
  userId = user!['id'] as string;
  orgId = org!['id'] as string;
  await db.sql`insert into organization_members (organization_id, user_id, role) values (${orgId}, ${userId}, 'owner')`;

  writeToken = (await apikeys.createApiKey({ orgId, userId, name: 'ci', scope: 'write', plan: 'agency' })).token;
  readToken = (await apikeys.createApiKey({ orgId, userId, name: 'ro', scope: 'read', plan: 'agency' })).token;
}, 180000);

afterAll(async () => {
  await db?.sql.end({ timeout: 3 });
  await pg?.stop();
});

describe('key lifecycle & storage', () => {
  it('tokens are ct_live_ prefixed and stored hashed only', async () => {
    expect(writeToken).toMatch(/^ct_live_[a-f0-9]{40}$/);
    const rows = await db.sql`select token_hash, token_prefix from api_keys`;
    for (const row of rows) {
      expect(row['token_hash']).toMatch(/^[a-f0-9]{64}$/);
      expect(row['token_hash']).not.toContain('ct_live_');
      expect((row['token_prefix'] as string).length).toBe(12);
    }
  });
  it('plans without apiAccess cannot create keys', async () => {
    await expect(apikeys.createApiKey({ orgId, userId, name: 'x', scope: 'read', plan: 'free' })).rejects.toMatchObject({ code: 'PLAN_LIMIT' });
  });
});

describe('authentication & scopes', () => {
  it('rejects missing, malformed and unknown tokens', async () => {
    expect((await sitesRoute.GET(request('/api/v1/sites'))).status).toBe(401);
    expect((await sitesRoute.GET(request('/api/v1/sites', { token: 'nope' }))).status).toBe(401);
    expect((await sitesRoute.GET(request('/api/v1/sites', { token: 'ct_live_' + '0'.repeat(40) }))).status).toBe(401);
  });
  it('accepts a valid key and creates a site over the API', async () => {
    const created = await sitesRoute.POST(
      request('/api/v1/sites', { method: 'POST', token: writeToken, body: { name: 'API Site', url: 'https://api-site.example.com', authorized: true } }),
    );
    expect(created.status).toBe(201);
    const body = await jsonOf(created);
    envId = body.data.environment_id;
    expect(envId).toBeTruthy();

    const list = await jsonOf(await sitesRoute.GET(request('/api/v1/sites', { token: writeToken })));
    expect(list.data.some((s: { name: string }) => s.name === 'API Site')).toBe(true);
  });
  it('read-only keys cannot write', async () => {
    const res = await scansRoute.POST(
      request('/api/v1/scans', { method: 'POST', token: readToken, body: { siteEnvironmentId: envId } }),
    );
    expect(res.status).toBe(403);
    expect((await jsonOf(res)).error.code).toBe('SCOPE');
  });
  it('revoked keys are rejected', async () => {
    const { key, token } = await apikeys.createApiKey({ orgId, userId, name: 'temp', scope: 'read', plan: 'agency' });
    await apikeys.revokeApiKey(orgId, key.id);
    const res = await sitesRoute.GET(request('/api/v1/sites', { token }));
    expect(res.status).toBe(401);
    expect((await jsonOf(res)).error.code).toBe('KEY_REVOKED');
  });
});

describe('scan creation & idempotency', () => {
  it('creates a queued scan and replays on the same Idempotency-Key', async () => {
    const first = await jsonOf(await scansRoute.POST(
      request('/api/v1/scans', { method: 'POST', token: writeToken, body: { siteEnvironmentId: envId }, headers: { 'idempotency-key': 'deploy-42' } }),
    ));
    expect(first.data.status).toBe('queued');

    const replay = await jsonOf(await scansRoute.POST(
      request('/api/v1/scans', { method: 'POST', token: writeToken, body: { siteEnvironmentId: envId }, headers: { 'idempotency-key': 'deploy-42' } }),
    ));
    expect(replay.idempotentReplay).toBe(true);
    expect(replay.data.id).toBe(first.data.id);

    const detail = await jsonOf(await scanDetailRoute.GET(
      request(`/api/v1/scans/${first.data.id}`, { token: readToken }),
      { params: Promise.resolve({ id: first.data.id }) },
    ));
    expect(detail.data.triggerType).toBe('api');
  });
  it('resolves siteId to its production environment', async () => {
    const sites = await jsonOf(await sitesRoute.GET(request('/api/v1/sites', { token: readToken })));
    const siteId = sites.data.find((s: { name: string }) => s.name === 'API Site').id;
    const res = await scansRoute.POST(request('/api/v1/scans', { method: 'POST', token: writeToken, body: { siteId } }));
    expect(res.status).toBe(201);
  });
});

describe('pagination', () => {
  it('pages scans with keyset cursors', async () => {
    for (let i = 0; i < 2; i++) {
      await scansRoute.POST(request('/api/v1/scans', { method: 'POST', token: writeToken, body: { siteEnvironmentId: envId } }));
    }
    const page1 = await jsonOf(await scansRoute.GET(request('/api/v1/scans?limit=2', { token: readToken })));
    expect(page1.data.length).toBe(2);
    expect(page1.pagination.hasMore).toBe(true);
    expect(page1.pagination.nextCursor).toBeTruthy();

    const page2 = await jsonOf(await scansRoute.GET(
      request(`/api/v1/scans?limit=50&cursor=${page1.pagination.nextCursor}`, { token: readToken }),
    ));
    expect(page2.data.length).toBeGreaterThan(0);
    const ids1 = new Set(page1.data.map((s: { id: string }) => s.id));
    for (const scan of page2.data) expect(ids1.has(scan.id)).toBe(false);

    const bad = await scansRoute.GET(request('/api/v1/scans?cursor=%%%bad', { token: readToken }));
    expect(bad.status).toBe(400);
  });
});

describe('baselines via API', () => {
  it('pins a completed scan as baseline', async () => {
    const [scan] = await db.sql`insert into scans (organization_id, site_environment_id, trigger_type, status, completed_at)
      values (${orgId}, ${envId}, 'api', 'completed', now()) returning id`;
    const res = await baselinesRoute.POST(
      request('/api/v1/baselines', { method: 'POST', token: writeToken, body: { scanId: scan!['id'], note: 'via api' } }),
    );
    expect(res.status).toBe(201);
    const active = await db.sql`select scan_id from baselines where site_environment_id = ${envId} and superseded_at is null`;
    expect(active[0]!['scan_id']).toBe(scan!['id']);
  });
});
