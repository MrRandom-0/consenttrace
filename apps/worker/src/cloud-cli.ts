/**
 * Cloud CI client: triggers a scan on a ConsentTrace deployment via the /v1 API
 * and waits for the verdict. Only deterministic rule findings drive exit codes.
 *
 * Usage:
 *   CONSENTTRACE_API_KEY=ct_live_… npx tsx apps/worker/src/cloud-cli.ts \
 *     --base-url https://app.example.com --site <siteId | site name> \
 *     [--scenarios no_action,reject_all,accept_all] [--fail-on high|critical|none] \
 *     [--timeout-sec 300] [--idempotency-key deploy-1234]
 *
 * Exit codes: 0 ok · 1 scan failed/errored · 2 findings at/above --fail-on · 64 usage.
 */
import type { Severity } from '@consenttrace/shared';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

interface Flags {
  [key: string]: string | boolean | undefined;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function apiCall<T>(baseUrl: string, apiKey: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(baseUrl.replace(/\/$/, '') + path, {
    ...init,
    headers: {
      authorization: `Bearer ${apiKey}`,
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: { code: string; message: string } };
  if (!res.ok) {
    throw new Error(`${data.error?.code ?? res.status}: ${data.error?.message ?? 'request failed'}`);
  }
  return data;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const apiKey = process.env.CONSENTTRACE_API_KEY;
  const baseUrl = (flags['base-url'] as string) ?? process.env.CONSENTTRACE_BASE_URL;
  const site = flags['site'] as string | undefined;
  if (!apiKey || !baseUrl || !site) {
    console.error('Required: CONSENTTRACE_API_KEY env, --base-url (or CONSENTTRACE_BASE_URL), --site <siteId or name>.');
    process.exit(64);
  }
  const failOn = ((flags['fail-on'] as string) ?? 'high') as 'none' | Severity;
  const timeoutSec = Number(flags['timeout-sec'] ?? 300);

  // Resolve site by id or name.
  const sites = await apiCall<{ data: Array<{ id: string; name: string; environment_id: string; url: string }> }>(baseUrl, apiKey, '/api/v1/sites');
  const match = sites.data.find((s) => s.id === site || s.name.toLowerCase() === site.toLowerCase());
  if (!match) {
    console.error(`Site "${site}" not found. Available: ${sites.data.map((s) => s.name).join(', ') || '(none)'}`);
    process.exit(64);
  }

  const scenarios = (flags['scenarios'] as string | undefined)?.split(',');
  const created = await apiCall<{ data: { id: string; status: string } }>(baseUrl, apiKey, '/api/v1/scans', {
    method: 'POST',
    body: JSON.stringify({ siteEnvironmentId: match.environment_id, ...(scenarios ? { scenarios } : {}) }),
    ...(flags['idempotency-key'] ? { headers: { 'idempotency-key': flags['idempotency-key'] as string } } : {}),
  });
  console.log(`ConsentTrace cloud scan ${created.data.id} queued for ${match.name} (${match.url})`);

  interface ScanSummaryLite {
    findingCount: number;
    regressionCount: number;
  }
  const deadline = Date.now() + timeoutSec * 1000;
  let status = created.data.status;
  let summary: ScanSummaryLite | null = null;
  let errorCode: string | null = null;
  while (Date.now() < deadline) {
    await sleep(5000);
    const scan = await apiCall<{ data: { status: string; summary: ScanSummaryLite | null; errorCode: string | null } }>(
      baseUrl, apiKey, `/api/v1/scans/${created.data.id}`,
    );
    status = scan.data.status;
    summary = scan.data.summary;
    errorCode = scan.data.errorCode;
    process.stdout.write(`  status: ${status}      \r`);
    if (status === 'completed' || status === 'failed') break;
  }
  console.log('');

  if (status === 'failed') {
    console.error(`SCAN FAILED: ${errorCode ?? 'unknown'}`);
    process.exit(1);
  }
  if (status !== 'completed') {
    console.error(`Timed out after ${timeoutSec}s (scan still ${status}).`);
    process.exit(1);
  }

  const findings = await apiCall<{ data: Array<{ rule_id: string; severity: Severity; regression: boolean; observation: string }> }>(
    baseUrl, apiKey, `/api/v1/scans/${created.data.id}/findings`,
  );
  console.log(`Findings: ${findings.data.length}${summary?.regressionCount ? ` (${summary.regressionCount} regression)` : ''}`);
  for (const f of findings.data) {
    console.log(` [${f.severity.toUpperCase()}]${f.regression ? ' [REGRESSION]' : ''} ${f.rule_id} — ${f.observation.slice(0, 140)}`);
  }
  console.log(`Report: ${baseUrl.replace(/\/$/, '')}/api/v1/scans/${created.data.id}/report`);

  if (failOn !== 'none') {
    const worst = findings.data.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity]), -1);
    if (worst >= SEVERITY_RANK[failOn]) {
      console.error(`Exit 2: deterministic finding at or above --fail-on ${failOn}.`);
      process.exit(2);
    }
  }
  console.log('OK — no findings at or above the threshold.');
}

main().catch((err) => {
  console.error('cloud scan crashed:', (err as Error).message);
  process.exit(1);
});
