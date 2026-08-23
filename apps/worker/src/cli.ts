/**
 * ConsentTrace scan CLI. Also the CI integration surface:
 * only deterministic rule results may drive a non-zero exit code.
 *
 * Usage:
 *   npm run scan -- <url> [--out DIR] [--scenarios a,b,c] [--baseline scan.json]
 *                  [--settle MS] [--fail-on high|critical|none] [--fixture-dns]
 *                  [--unsafe-allow-private] [--no-inline]
 */
import { runScan, type ScanConfig } from './scan';
import type { ScenarioType, Severity } from '@consenttrace/shared';

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

function parseArgs(argv: string[]) {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else {
      positional.push(arg);
    }
  }
  return { flags, positional };
}

async function main() {
  const { flags, positional } = parseArgs(process.argv.slice(2));
  const url = positional[0];
  if (!url) {
    console.error('Usage: npm run scan -- <url> [--out DIR] [--scenarios no_action,reject_all,accept_all] [--baseline scan.json] [--fail-on none|high|critical]');
    process.exit(64);
  }

  const outDir = (flags.get('out') as string) ?? `scan-output/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const scenarios = ((flags.get('scenarios') as string) ?? 'no_action,reject_all,accept_all').split(',') as ScenarioType[];
  const failOn = ((flags.get('fail-on') as string) ?? 'none') as 'none' | Severity;

  const config: ScanConfig = {
    url,
    outDir,
    scenarios,
    settleMs: flags.has('settle') ? Number(flags.get('settle')) : undefined,
    baselinePath: (flags.get('baseline') as string) || undefined,
    allowPrivateTargets: flags.get('unsafe-allow-private') === true || flags.get('fixture-dns') === true,
    inlineReportImages: flags.get('no-inline') !== true,
  };

  if (flags.get('fixture-dns') === true) {
    config.hostResolverRules =
      'MAP site.fixture.test 127.0.0.1, MAP metrics.fxanalytics.example 127.0.0.1, MAP cdn.fxtracker.example 127.0.0.1';
    config.domainOverrides = [
      { domain: 'metrics.fxanalytics.example', category: 'analytics', vendor: 'Fixture Analytics' },
      { domain: 'cdn.fxtracker.example', category: 'advertising', vendor: 'Fixture Ads' },
    ];
  }

  console.log(`\nConsentTrace scan\n  target:    ${url}\n  scenarios: ${scenarios.join(', ')}\n  output:    ${outDir}\n`);
  const { result } = await runScan(config);

  if (result.status === 'failed' && result.scenarios.length === 0) {
    console.error(`SCAN FAILED: ${result.failureCode} — ${result.failureMessage}`);
    process.exit(1);
  }

  for (const s of result.scenarios) {
    const cookies = s.cookies.after_settle ?? s.cookies.after_page_load ?? [];
    const tracking = s.network.filter((n) => n.requestCategory === 'advertising' || n.requestCategory === 'analytics').length;
    console.log(
      `  ${s.scenario.padEnd(12)} ${s.status.padEnd(28)} cmp=${s.cmp.detected ? (s.cmp.provider ?? 'custom') : 'none'}  action=${s.consentAction ? `"${s.consentAction.buttonText}"` : '—'}  cookies=${cookies.length}  trackingReqs=${tracking}  reloadBanner=${s.bannerAfterReload === null ? '—' : s.bannerAfterReload}`,
    );
  }

  const findings = result.findings.filter((f) => f.status === 'finding');
  console.log(`\n  Findings: ${findings.length}`);
  for (const f of findings) {
    console.log(`   [${f.severity.toUpperCase()}]${f.regression ? ' [REGRESSION]' : ''} ${f.ruleId} — ${f.observation}`);
  }
  console.log(`\n  Evidence: ${result.evidence?.artifacts.length ?? 0} artifacts, manifest sha256 ${result.evidence?.manifestSha256.slice(0, 16)}…`);
  console.log(`  Report:   ${outDir}/report.html\n  Data:     ${outDir}/scan.json\n`);

  if (failOn !== 'none') {
    const threshold = SEVERITY_RANK[failOn];
    const worst = findings.reduce((max, f) => Math.max(max, SEVERITY_RANK[f.severity]), -1);
    if (worst >= threshold) {
      console.error(`  Exit 2: deterministic finding at or above --fail-on ${failOn}.`);
      process.exit(2);
    }
  }
}

main().catch((err) => {
  console.error('Scan crashed:', err);
  process.exit(1);
});
