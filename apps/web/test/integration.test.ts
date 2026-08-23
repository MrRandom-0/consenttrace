/**
 * Web-tier integration tests against a REAL embedded PostgreSQL 17 instance:
 * auth (scrypt + sessions), entitlements enforcement, queue-claim semantics,
 * baseline supersede behavior. Same migrations as production.
 */
import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PORT = 5436;
const DSN = `postgres://ct:ct@127.0.0.1:${PORT}/ct_test`;
const MIGRATE = fileURLToPath(new URL('../../../packages/database/scripts/migrate.mjs', import.meta.url));

/* eslint-disable @typescript-eslint/no-explicit-any */
let pg: any;
let db: typeof import('../src/server/db');
let auth: typeof import('../src/server/auth');
let entitlements: typeof import('../src/server/entitlements');
let scans: typeof import('../src/server/scans');
let retention: typeof import('../src/server/retention');
let stripe: typeof import('../src/server/stripe');
let notify: typeof import('../src/server/notify');
let storage: typeof import('../src/server/storage');

let orgId = '';
let userId = '';
let envId = '';

beforeAll(async () => {
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = await mkdtemp(join(tmpdir(), 'ct-int-pg-'));
  pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'ct', password: 'ct', port: PORT, persistent: false });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ct_test');

  const migrate = spawnSync('node', [MIGRATE], { env: { ...process.env, DATABASE_URL: DSN }, encoding: 'utf8' });
  if (migrate.status !== 0) throw new Error('migrations failed: ' + migrate.stderr);

  process.env['DATABASE_URL'] = DSN;
  process.env['CT_STORAGE_DIR'] = await mkdtemp(join(tmpdir(), 'ct-int-storage-'));
  db = await import('../src/server/db');
  auth = await import('../src/server/auth');
  entitlements = await import('../src/server/entitlements');
  scans = await import('../src/server/scans');
  retention = await import('../src/server/retention');
  stripe = await import('../src/server/stripe');
  notify = await import('../src/server/notify');
  storage = await import('../src/server/storage');

  const [user] = await db.sql`insert into users (email, name, password_hash) values ('it@test.dev', 'IT', null) returning id`;
  const [org] = await db.sql`insert into organizations (name, slug, plan) values ('IT Org', 'it-org', 'free') returning id`;
  userId = user!['id'] as string;
  orgId = org!['id'] as string;
  await db.sql`insert into organization_members (organization_id, user_id, role) values (${orgId}, ${userId}, 'owner')`;
  const [site] = await db.sql`insert into sites (organization_id, name, primary_url, authorized_confirmed_at) values (${orgId}, 'IT Site', 'https://it.example.com', now()) returning id`;
  const [env] = await db.sql`insert into site_environments (site_id, name, base_url) values (${site!['id']}, 'Production', 'https://it.example.com') returning id`;
  envId = env!['id'] as string;
}, 180000);

afterAll(async () => {
  await db?.sql.end({ timeout: 3 });
  await pg?.stop();
});

describe('auth', () => {
  it('scrypt hash round-trips and rejects wrong passwords', async () => {
    const hash = await auth.hashPassword('correct-horse-battery-42');
    expect(hash).toMatch(/^scrypt:16384:8:1:/);
    expect(await auth.verifyPassword('correct-horse-battery-42', hash)).toBe(true);
    expect(await auth.verifyPassword('wrong-password', hash)).toBe(false);
  });

  it('sessions authenticate, expire, and never store raw tokens', async () => {
    const { token } = await auth.createSession(userId);
    const ctx = await auth.getAuthFromToken(token);
    expect(ctx?.user.email).toBe('it@test.dev');
    expect(ctx?.org.role).toBe('owner');

    const stored = await db.sql`select token_hash from sessions where user_id = ${userId}`;
    expect(stored.some((r) => (r['token_hash'] as string) === token)).toBe(false); // hashed only

    await db.sql`update sessions set expires_at = now() - interval '1 minute' where user_id = ${userId}`;
    expect(await auth.getAuthFromToken(token)).toBeNull();
  });
});

describe('entitlements', () => {
  it('free plan limits are enforced by checkLimit + usage counting', async () => {
    const usage = await entitlements.usageFor(orgId);
    expect(usage.sites).toBe(1);
    const limit = entitlements.checkLimit(usage.sites, entitlements.entitlementsFor('free').maxSites, 'sites');
    expect(limit.ok).toBe(false);
    expect(limit.message).toContain('Plan limit reached');
  });
});

describe('scan queue', () => {
  it('createScan requires authorization confirmation and enqueues', async () => {
    const scan = await scans.createScan({ orgId, orgPlan: 'free', userId, siteEnvironmentId: envId });
    expect(scan.status).toBe('queued');
  });

  it('claims oldest-first with SKIP LOCKED semantics and never double-claims', async () => {
    const second = await scans.createScan({ orgId, orgPlan: 'free', userId, siteEnvironmentId: envId });
    const claim1 = await scans.claimNextQueuedScan('worker-a');
    const claim2 = await scans.claimNextQueuedScan('worker-b');
    const claim3 = await scans.claimNextQueuedScan('worker-c');
    expect(claim1?.status).toBe('running');
    expect(claim2?.status).toBe('running');
    expect(new Date(claim1!.created_at).getTime()).toBeLessThanOrEqual(new Date(claim2!.created_at).getTime());
    expect(claim1!.id).not.toBe(claim2!.id);
    expect([claim1!.id, claim2!.id]).toContain(second.id);
    expect(claim3).toBeNull();
  });

  it('rejects scans for unauthorized sites', async () => {
    const [site] = await db.sql`insert into sites (organization_id, name, primary_url) values (${orgId}, 'NoAuth', 'https://noauth.example.com') returning id`;
    const [env] = await db.sql`insert into site_environments (site_id, name, base_url) values (${site!['id']}, 'Production', 'https://noauth.example.com') returning id`;
    await expect(
      scans.createScan({ orgId, orgPlan: 'free', userId, siteEnvironmentId: env!['id'] as string }),
    ).rejects.toMatchObject({ code: 'DOMAIN_NOT_AUTHORIZED' });
  });
});

describe('stripe webhook handling', () => {
  it('applies checkout completion idempotently', async () => {
    const [org2] = await db.sql`insert into organizations (name, slug, plan) values ('Billing Org', 'billing-org', 'free') returning id`;
    const event = {
      id: 'evt_test_1',
      type: 'checkout.session.completed',
      data: { object: { client_reference_id: org2!['id'] as string, metadata: { org_id: org2!['id'] as string, plan: 'agency' }, customer: 'cus_123', subscription: 'sub_123' } },
    };
    const first = await stripe.handleStripeEvent(event);
    expect(first).toEqual({ applied: true, duplicate: false });
    const [row] = await db.sql`select plan, subscription_status, stripe_subscription_id from organizations where id = ${org2!['id']}`;
    expect(row!['plan']).toBe('agency');
    expect(row!['subscription_status']).toBe('active');

    const second = await stripe.handleStripeEvent(event);
    expect(second.duplicate).toBe(true);
    const audits = await db.sql`select count(*)::int as n from audit_log where organization_id = ${org2!['id']} and event = 'subscription_changed'`;
    expect(audits[0]!['n']).toBe(1); // idempotent — no double side effects
  });

  it('downgrades on subscription deletion and flags failed payments', async () => {
    await stripe.handleStripeEvent({ id: 'evt_test_2', type: 'invoice.payment_failed', data: { object: { customer: 'cus_123' } } });
    let [row] = await db.sql`select subscription_status from organizations where stripe_customer_id = 'cus_123'`;
    expect(row!['subscription_status']).toBe('past_due');
    await stripe.handleStripeEvent({ id: 'evt_test_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_123' } } });
    [row] = await db.sql`select plan, subscription_status from organizations where stripe_customer_id = 'cus_123'`;
    expect(row!['plan']).toBe('free');
    expect(row!['subscription_status']).toBe('canceled');
  });
});

describe('domain verification scan cap', () => {
  it('caps unverified sites per month and lifts the cap once verified', async () => {
    process.env['CT_UNVERIFIED_SITE_MONTHLY_CAP'] = '3';
    const [org3] = await db.sql`insert into organizations (name, slug, plan) values ('Cap Org', 'cap-org', 'agency') returning id`;
    const [site] = await db.sql`insert into sites (organization_id, name, primary_url, authorized_confirmed_at, verification_token)
      values (${org3!['id']}, 'Cap Site', 'https://cap.example.com', now(), 'tok123') returning id`;
    const [env] = await db.sql`insert into site_environments (site_id, name, base_url) values (${site!['id']}, 'Production', 'https://cap.example.com') returning id`;
    const capEnvId = env!['id'] as string;
    for (let i = 0; i < 3; i++) {
      await db.sql`insert into scans (organization_id, site_environment_id, trigger_type, status) values (${org3!['id']}, ${capEnvId}, 'manual_cloud', 'completed')`;
    }
    await expect(
      scans.createScan({ orgId: org3!['id'] as string, orgPlan: 'agency', userId, siteEnvironmentId: capEnvId }),
    ).rejects.toMatchObject({ code: 'VERIFICATION_REQUIRED' });

    await db.sql`update sites set verified_at = now(), verification_method = 'dns_txt' where id = ${site!['id']}`;
    const scan = await scans.createScan({ orgId: org3!['id'] as string, orgPlan: 'agency', userId, siteEnvironmentId: capEnvId });
    expect(scan.status).toBe('queued');
    delete process.env['CT_UNVERIFIED_SITE_MONTHLY_CAP'];
  });
});

describe('evidence retention sweeper', () => {
  it('deletes expired scans + storage but always keeps active-baseline scans', async () => {
    const { mkdir, writeFile, access } = await import('node:fs/promises');
    const [org4] = await db.sql`insert into organizations (name, slug, plan) values ('Retention Org', 'retention-org', 'free') returning id`; // free = 7 days
    const [site] = await db.sql`insert into sites (organization_id, name, primary_url, authorized_confirmed_at) values (${org4!['id']}, 'R Site', 'https://r.example.com', now()) returning id`;
    const [env] = await db.sql`insert into site_environments (site_id, name, base_url) values (${site!['id']}, 'Production', 'https://r.example.com') returning id`;

    const mkScan = async (daysAgo: number) => {
      const [row] = await db.sql`insert into scans (organization_id, site_environment_id, trigger_type, status, created_at, completed_at)
        values (${org4!['id']}, ${env!['id']}, 'manual_cloud', 'completed', now() - make_interval(days => ${daysAgo}), now() - make_interval(days => ${daysAgo})) returning id`;
      const dir = join(storage.storageBase(), 'scans', row!['id'] as string);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'scan.json'), '{}');
      return row!['id'] as string;
    };
    const expired = await mkScan(30);
    const pinned = await mkScan(30);
    const fresh = await mkScan(1);
    await db.sql`insert into baselines (organization_id, site_environment_id, scan_id) values (${org4!['id']}, ${env!['id']}, ${pinned})`;

    const result = await retention.sweepExpiredEvidence();
    expect(result.scansDeleted).toBeGreaterThanOrEqual(1);

    const remaining = (await db.sql`select id from scans where site_environment_id = ${env!['id']}`).map((r) => r['id']);
    expect(remaining).not.toContain(expired);
    expect(remaining).toContain(pinned); // active baseline evidence always kept
    expect(remaining).toContain(fresh);
    await expect(access(join(storage.storageBase(), 'scans', expired))).rejects.toThrow();
    await expect(access(join(storage.storageBase(), 'scans', pinned))).resolves.toBeUndefined();
  });
});

describe('notifications', () => {
  it('alerts owners on regressions and stays quiet on healthy scans', async () => {
    const sent: Array<{ to: string[]; subject: string }> = [];
    const capture = async (m: { to: string[]; subject: string; text: string }) => { sent.push(m); };
    const scanRow = { id: '00000000-0000-0000-0000-000000000001', organization_id: orgId, status: 'completed', error_code: null } as never;
    const regressed = { findingCount: 5, regressionCount: 1, scenarios: [] };
    const fired = await notify.notifyScanOutcome(scanRow, 'IT Site', regressed as never, capture);
    expect(fired).toBe(true);
    expect(sent[0]!.to).toContain('it@test.dev');
    expect(sent[0]!.subject).toContain('REGRESSION');

    const healthy = { findingCount: 0, regressionCount: 0, scenarios: [] };
    expect(await notify.notifyScanOutcome(scanRow, 'IT Site', healthy as never, capture)).toBe(false);
    expect(sent).toHaveLength(1);
  });
});

describe('baselines', () => {
  it('supersedes previous baselines instead of replacing them', async () => {
    const [scanA] = await db.sql`insert into scans (organization_id, site_environment_id, trigger_type, status, completed_at) values (${orgId}, ${envId}, 'manual_cloud', 'completed', now()) returning *`;
    const [scanB] = await db.sql`insert into scans (organization_id, site_environment_id, trigger_type, status, completed_at) values (${orgId}, ${envId}, 'manual_cloud', 'completed', now()) returning *`;
    await scans.setBaseline({ orgId, userId, scan: scanA as never, note: 'first' });
    await scans.setBaseline({ orgId, userId, scan: scanB as never, note: 'second' });
    const all = await db.sql`select scan_id, superseded_at from baselines where site_environment_id = ${envId} order by created_at asc`;
    expect(all.length).toBe(2);
    expect(all[0]!['superseded_at']).not.toBeNull(); // history kept, marked superseded
    expect(all[1]!['superseded_at']).toBeNull();
    const active = await scans.activeBaseline(envId);
    expect(active?.scan_id).toBe(scanB!['id']);
  });
});
