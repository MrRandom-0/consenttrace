/** Scan domain: creation (queue), persistence of worker results, retrieval. */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ScanResult, ScenarioType } from '@consenttrace/shared';
import { audit } from './audit';
import { jsonb, sql, type BaselineRow, type ScanRow, type ScanSummaryJson } from './db';
import { checkLimit, entitlementsFor, usageFor } from './entitlements';
import { HttpError } from './http';
import { scanOutputDir } from './storage';
import { assertVerificationAllowsScan } from './verification';

export async function createScan(opts: {
  orgId: string;
  orgPlan: string;
  /** Null for API-key-triggered scans (no user actor). */
  userId: string | null;
  siteEnvironmentId: string;
  scenarios?: ScenarioType[];
  triggerType?: 'manual_cloud' | 'scheduled' | 'api' | 'ci';
}): Promise<ScanRow> {
  const envRows = await sql`
    select se.id, s.organization_id, s.authorized_confirmed_at, s.status as site_status
    from site_environments se join sites s on s.id = se.site_id
    where se.id = ${opts.siteEnvironmentId}`;
  const env = envRows[0];
  if (!env || env['organization_id'] !== opts.orgId) {
    throw new HttpError(404, 'NOT_FOUND', 'Site environment not found in this workspace.');
  }
  if (!env['authorized_confirmed_at']) {
    throw new HttpError(403, 'DOMAIN_NOT_AUTHORIZED', 'Confirm authorization to test this site before scanning.');
  }
  const usage = await usageFor(opts.orgId);
  const limit = checkLimit(usage.scansThisMonth, entitlementsFor(opts.orgPlan).maxMonthlyScans, 'scans this month');
  if (!limit.ok) throw new HttpError(402, 'PLAN_LIMIT', limit.message!);
  await assertVerificationAllowsScan(opts.siteEnvironmentId);

  const scenarios = opts.scenarios ?? ['no_action', 'reject_all', 'accept_all'];
  const rows = await sql<ScanRow[]>`
    insert into scans (organization_id, site_environment_id, trigger_type, status, requested_scenarios, created_by)
    values (${opts.orgId}, ${opts.siteEnvironmentId}, ${opts.triggerType ?? 'manual_cloud'}, 'queued', ${sql.json(scenarios)}, ${opts.userId})
    returning *`;
  const scan = rows[0]!;
  await audit(opts.orgId, opts.userId, 'scan_started', 'scan', scan.id, { scenarios, trigger: opts.triggerType ?? 'manual_cloud' });
  return scan;
}

/** Queue abstraction: claim the oldest queued scan (FOR UPDATE SKIP LOCKED). */
export async function claimNextQueuedScan(workerId: string): Promise<ScanRow | null> {
  const rows = await sql<ScanRow[]>`
    update scans set status = 'running', started_at = now(), claimed_at = now(), worker_id = ${workerId}
    where id = (
      select id from scans where status = 'queued' order by created_at asc
      for update skip locked limit 1
    )
    returning *`;
  return rows[0] ?? null;
}

export async function getScanForOrg(scanId: string, orgId: string): Promise<ScanRow | null> {
  const rows = await sql<ScanRow[]>`select * from scans where id = ${scanId} and organization_id = ${orgId}`;
  return rows[0] ?? null;
}

export async function loadScanResult(scan: ScanRow): Promise<ScanResult | null> {
  if (!scan.result_artifact_path) return null;
  try {
    const dir = await scanOutputDir(scan.id);
    return JSON.parse(await readFile(join(dir, 'scan.json'), 'utf8')) as ScanResult;
  } catch {
    return null;
  }
}

export function summarize(result: ScanResult): ScanSummaryJson {
  const findings = result.findings.filter((f) => f.status === 'finding');
  return {
    findingCount: findings.length,
    regressionCount: findings.filter((f) => f.regression).length,
    scenarios: result.scenarios.map((s) => ({
      scenario: s.scenario,
      status: s.status,
      cmpDetected: s.cmp.detected,
      cmpProvider: s.cmp.provider ?? (s.cmp.detected ? 'custom' : null),
      actionText: s.consentAction?.buttonText ?? null,
      cookieCount: (s.cookies.after_settle ?? s.cookies.after_page_load ?? []).length,
      trackingRequestCount: s.network.filter((n) => n.requestCategory === 'analytics' || n.requestCategory === 'advertising').length,
      bannerAfterReload: s.bannerAfterReload,
    })),
  };
}

/**
 * Persist a completed worker run: scan row, scenario rows, findings, evidence index.
 * baselineScanDbId is the platform's baseline scan row id — authoritative over the
 * id embedded in the baseline artifact file.
 */
export async function persistScanResult(scan: ScanRow, result: ScanResult, baselineScanDbId: string | null = null): Promise<void> {
  const summary = summarize(result);
  await sql.begin(async (tx) => {
    await tx`update scans set
      status = ${result.status === 'completed' ? 'completed' : 'failed'},
      completed_at = ${result.completedAt},
      scanner_version = ${result.scannerVersion},
      rule_pack_version = ${result.rulePackVersion},
      browser_version = ${result.browser.version},
      locale = ${result.locale},
      viewport = ${tx.json(result.viewport)},
      error_code = ${result.failureCode},
      error_message = ${result.failureMessage},
      baseline_scan_id = ${baselineScanDbId},
      summary = ${jsonb(summary)},
      result_artifact_path = ${'scan.json'},
      report_artifact_path = ${'report.html'}
      where id = ${scan.id}`;

    for (const s of result.scenarios) {
      await tx`insert into scenario_runs (scan_id, scenario_type, status, started_at, duration_ms, action_strategy, action_confidence, cmp_provider, cmp_confidence, banner_after_reload, failure_code, observations)
        values (${scan.id}, ${s.scenario}, ${s.status}, ${s.startedAt}, ${s.durationMs},
                ${s.consentAction?.selectorStrategy ?? null}, ${s.consentAction?.confidence ?? null},
                ${s.cmp.provider ?? null}, ${s.cmp.confidence}, ${s.bannerAfterReload}, ${s.failureCode},
                ${tx.json(s.observations)})`;
    }
    for (const f of result.findings.filter((x) => x.status === 'finding')) {
      await tx`insert into findings (organization_id, scan_id, rule_id, rule_version, severity, status, title, observation, expected_behavior, actual_behavior, evidence_ids, regression, metadata)
        values (${scan.organization_id}, ${scan.id}, ${f.ruleId}, ${f.ruleVersion}, ${f.severity}, 'open', ${f.title}, ${f.observation}, ${f.expectedBehavior}, ${f.actualBehavior}, ${tx.json(f.evidenceIds)}, ${f.regression}, ${jsonb(f.metadata)})`;
    }
    if (result.evidence) {
      for (const item of result.evidence.artifacts) {
        await tx`insert into evidence_items (scan_id, type, label, artifact_path, sha256, bytes)
          values (${scan.id}, ${item.type}, ${item.label}, ${item.artifactPath}, ${item.sha256}, ${item.bytes})`;
      }
    }
  });
}

export async function activeBaseline(siteEnvironmentId: string): Promise<BaselineRow | null> {
  const rows = await sql<BaselineRow[]>`
    select * from baselines
    where site_environment_id = ${siteEnvironmentId} and superseded_at is null
    order by created_at desc limit 1`;
  return rows[0] ?? null;
}

export async function setBaseline(opts: {
  orgId: string;
  /** Null when set via API key (no user actor). */
  userId: string | null;
  scan: ScanRow;
  note: string | null;
}): Promise<void> {
  if (opts.scan.status !== 'completed') {
    throw new HttpError(400, 'INVALID_STATE', 'Only completed scans can become baselines.');
  }
  await sql.begin(async (tx) => {
    // Baselines are never silently replaced — prior rows are superseded, kept.
    await tx`update baselines set superseded_at = now()
      where site_environment_id = ${opts.scan.site_environment_id} and superseded_at is null`;
    await tx`insert into baselines (organization_id, site_environment_id, scan_id, rule_pack_version, scanner_version, note, created_by)
      values (${opts.orgId}, ${opts.scan.site_environment_id}, ${opts.scan.id}, ${opts.scan.rule_pack_version}, ${opts.scan.scanner_version}, ${opts.note}, ${opts.userId})`;
  });
  await audit(opts.orgId, opts.userId, 'baseline_changed', 'scan', opts.scan.id, { note: opts.note });
}
