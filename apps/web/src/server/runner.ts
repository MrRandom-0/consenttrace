/**
 * In-process scan runner: claims queued scans (Postgres FOR UPDATE SKIP LOCKED)
 * and executes the Playwright worker. Deployment note (docs/DEPLOYMENT.md):
 * production runs this loop in dedicated worker containers via the same queue
 * abstraction; the in-process mode keeps self-hosted single-node setups real.
 */
import { hostname } from 'node:os';
import { join } from 'node:path';
import { runScan, type ScanConfig } from '@consenttrace/worker';
import type { ScenarioType } from '@consenttrace/shared';
import { audit } from './audit';
import { sql, type ScanRow, type ScanSummaryJson, type ScheduleRow } from './db';
import { notifyScanOutcome } from './notify';
import { sweepExpiredEvidence } from './retention';
import { nextRun } from './schedules';
import { activeBaseline, claimNextQueuedScan, persistScanResult, summarize } from './scans';
import { scanOutputDir, storageBase } from './storage';

const WORKER_ID = `web-${hostname()}-${process.pid}`;
const POLL_MS = 3000;
const SCHEDULE_TICK_MS = 30000;

// Fixture targets are allowed only when explicitly enabled (dev/demo). SSRF
// policy stays fully enforced for every other target.
const FIXTURE_HOSTS = ['site.fixture.test', 'metrics.fxanalytics.example', 'cdn.fxtracker.example'];
const fixturesAllowed = () => process.env.CT_ALLOW_FIXTURE_TARGETS !== 'false';

function fixtureConfigFor(url: string): Partial<ScanConfig> {
  try {
    const host = new URL(url).hostname;
    if (!fixturesAllowed() || !FIXTURE_HOSTS.some((h) => host === h)) return {};
    return {
      allowPrivateTargets: true,
      hostResolverRules: FIXTURE_HOSTS.map((h) => `MAP ${h} 127.0.0.1`).join(', '),
      domainOverrides: [
        { domain: 'metrics.fxanalytics.example', category: 'analytics', vendor: 'Fixture Analytics' },
        { domain: 'cdn.fxtracker.example', category: 'advertising', vendor: 'Fixture Ads' },
      ],
    };
  } catch {
    return {};
  }
}

const claimNext = (): Promise<ScanRow | null> => claimNextQueuedScan(WORKER_ID);

async function processScan(scan: ScanRow): Promise<void> {
  const envRows = await sql`
    select se.base_url, se.default_locale, s.name as site_name
    from site_environments se join sites s on s.id = se.site_id
    where se.id = ${scan.site_environment_id}`;
  const env = envRows[0];
  if (!env) throw new Error('site environment missing');

  const outDir = await scanOutputDir(scan.id);
  const baseline = await activeBaseline(scan.site_environment_id);
  let baselinePath: string | undefined;
  if (baseline) {
    baselinePath = join(await scanOutputDir(baseline.scan_id), 'scan.json');
  }

  const config: ScanConfig = {
    url: env['base_url'] as string,
    scanId: scan.id,
    outDir,
    scenarios: scan.requested_scenarios as ScenarioType[],
    locale: (env['default_locale'] as string) ?? 'en-GB',
    settleMs: 2500,
    inlineReportImages: true,
    ...(baselinePath ? { baselinePath } : {}),
    ...fixtureConfigFor(env['base_url'] as string),
  };

  const { result } = await runScan(config);
  await persistScanResult(scan, result, baseline?.scan_id ?? null);
  await audit(
    scan.organization_id,
    null,
    result.status === 'completed' ? 'scan_completed' : 'scan_failed',
    'scan',
    scan.id,
    { findings: result.findings.filter((f) => f.status === 'finding').length, failureCode: result.failureCode },
  );
  const summary: ScanSummaryJson = summarize(result);
  const updated: ScanRow = { ...scan, status: result.status === 'completed' ? 'completed' : 'failed', error_code: result.failureCode };
  await notifyScanOutcome(updated, env['site_name'] as string, summary);
}

async function markFailed(scan: ScanRow, err: unknown): Promise<void> {
  await sql`update scans set status = 'failed', completed_at = now(),
    error_code = 'WORKER_TIMEOUT', error_message = ${String((err as Error).message ?? err).slice(0, 500)}
    where id = ${scan.id} and status = 'running'`;
  await audit(scan.organization_id, null, 'scan_failed', 'scan', scan.id, {});
}

async function tickSchedules(): Promise<void> {
  const due = await sql<ScheduleRow[]>`
    select * from scan_schedules where enabled = true and (next_run_at is null or next_run_at <= now())
    limit 10`;
  for (const schedule of due) {
    const next = nextRun(schedule.cron) ?? new Date(Date.now() + 86400000);
    if (schedule.next_run_at === null) {
      // First tick after creation: just prime the next run, don't fire immediately.
      await sql`update scan_schedules set next_run_at = ${next} where id = ${schedule.id}`;
      continue;
    }
    await sql`update scan_schedules set last_run_at = now(), next_run_at = ${next} where id = ${schedule.id}`;
    await sql`insert into scans (organization_id, site_environment_id, trigger_type, status, requested_scenarios)
      values (${schedule.organization_id}, ${schedule.site_environment_id}, 'scheduled', 'queued', ${sql.json(schedule.scenarios)})`;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __ctRunnerStarted: boolean | undefined;
}

export function startRunner(): void {
  if (globalThis.__ctRunnerStarted) return;
  globalThis.__ctRunnerStarted = true;
  console.log(`[runner] started (${WORKER_ID}); storage: ${storageBase()}`);

  let busy = false;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const scan = await claimNext();
      if (scan) {
        console.log(`[runner] scan ${scan.id} claimed`);
        try {
          await processScan(scan);
          console.log(`[runner] scan ${scan.id} finished`);
        } catch (err) {
          console.error(`[runner] scan ${scan.id} failed`, err);
          await markFailed(scan, err);
        }
      }
    } catch (err) {
      console.error('[runner] loop error', err);
    } finally {
      busy = false;
    }
  }, POLL_MS).unref();

  setInterval(() => void tickSchedules().catch((err) => console.error('[runner] schedule tick error', err)), SCHEDULE_TICK_MS).unref();

  // Evidence retention: sweep shortly after boot, then every 6 hours.
  setTimeout(() => void sweepExpiredEvidence().catch((err) => console.error('[retention] sweep error', err)), 15000).unref();
  setInterval(() => void sweepExpiredEvidence().catch((err) => console.error('[retention] sweep error', err)), 6 * 3600000).unref();
}
