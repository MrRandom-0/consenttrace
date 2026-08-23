/**
 * HTML evidence report. Deterministic with regard to evidence: every number,
 * cookie, domain and date comes from the ScanResult — no generated facts.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DISCLAIMER,
  type CookieObservation,
  type RuleResult,
  type ScanResult,
  type ScenarioResult,
  type Severity,
} from '@consenttrace/shared';

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#b42318',
  high: '#d92d20',
  medium: '#dc6803',
  low: '#ca8504',
  info: '#475467',
};

const SCENARIO_LABEL: Record<string, string> = {
  no_action: 'No action',
  accept_all: 'Accept all',
  reject_all: 'Reject all',
  essential_only: 'Essential only',
  custom_preferences: 'Custom preferences',
  withdraw_consent: 'Withdraw consent',
};

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}

function settledCookies(s: ScenarioResult) {
  return s.cookies.after_settle ?? s.cookies.after_page_load ?? [];
}

function postActionNetwork(s: ScenarioResult) {
  if (s.consentAction) return s.network.filter((n) => n.atMs > s.consentAction!.atMs);
  return s.network;
}

interface MatrixCell {
  text: string;
  tone: 'neutral' | 'good' | 'flag';
}

function matrixRows(scan: ScanResult): Array<{ label: string; cells: MatrixCell[] }> {
  const scenarios = scan.scenarios.filter((s) => s.status !== 'skipped');
  const cookieRow = (label: string, category: string): { label: string; cells: MatrixCell[] } => ({
    label,
    cells: scenarios.map((s) => {
      const count = settledCookies(s).filter((c) => c.category === category).length;
      const flagged = (category === 'analytics' || category === 'advertising') && (s.scenario === 'no_action' || s.scenario === 'reject_all');
      return count > 0
        ? { text: `Observed (${count})`, tone: flagged ? 'flag' : 'neutral' }
        : { text: 'None observed', tone: flagged ? 'good' : 'neutral' };
    }),
  });
  const requestRow = (label: string, category: string): { label: string; cells: MatrixCell[] } => ({
    label,
    cells: scenarios.map((s) => {
      const count = postActionNetwork(s).filter((n) => n.requestCategory === category).length;
      const flagged = s.scenario === 'no_action' || s.scenario === 'reject_all';
      return count > 0
        ? { text: `Observed (${count})`, tone: flagged ? 'flag' : 'neutral' }
        : { text: 'None observed', tone: flagged ? 'good' : 'neutral' };
    }),
  });
  const preferenceRow: { label: string; cells: MatrixCell[] } = {
    label: 'Consent preference',
    cells: scenarios.map((s) => {
      if (s.scenario === 'no_action') return { text: 'Pending', tone: 'neutral' };
      if (s.consentAction) return { text: s.scenario === 'accept_all' ? 'Granted' : 'Rejected', tone: 'neutral' };
      return { text: 'Action not found', tone: 'flag' };
    }),
  };
  const persistenceRow: { label: string; cells: MatrixCell[] } = {
    label: 'Preference persisted after reload',
    cells: scenarios.map((s) => {
      if (s.bannerAfterReload === null) return { text: '—', tone: 'neutral' };
      return s.bannerAfterReload ? { text: 'Banner shown again', tone: 'flag' } : { text: 'Persisted', tone: 'good' };
    }),
  };
  return [
    cookieRow('Necessary cookies', 'strictly_necessary'),
    cookieRow('Functional cookies', 'functional'),
    cookieRow('Analytics cookies', 'analytics'),
    cookieRow('Advertising cookies', 'advertising'),
    cookieRow('Unclassified cookies', 'unknown'),
    requestRow('Analytics requests', 'analytics'),
    requestRow('Advertising requests', 'advertising'),
    preferenceRow,
    persistenceRow,
  ];
}

function findingCard(f: RuleResult): string {
  const color = SEVERITY_COLOR[f.severity];
  return `
  <div class="finding">
    <div class="finding-head">
      <span class="chip" style="background:${color}1a;color:${color};border:1px solid ${color}40">${esc(f.severity.toUpperCase())}</span>
      ${f.regression ? '<span class="chip chip-reg">REGRESSION</span>' : ''}
      <strong>${esc(f.ruleId)} — ${esc(f.name)}</strong>
      ${f.scenario ? `<span class="muted">· ${esc(SCENARIO_LABEL[f.scenario] ?? f.scenario)}</span>` : ''}
    </div>
    <p class="obs">${esc(f.observation)}</p>
    ${f.expectedBehavior ? `<div class="kv"><span>Expected</span><p>${esc(f.expectedBehavior)}</p></div>` : ''}
    ${f.actualBehavior ? `<div class="kv"><span>Actual</span><p>${esc(f.actualBehavior)}</p></div>` : ''}
    ${f.evidenceIds.length ? `<div class="kv"><span>Evidence</span><p class="mono">${f.evidenceIds.map(esc).join(', ')}</p></div>` : ''}
  </div>`;
}

async function imageDataUri(outDir: string, relPath: string): Promise<string | null> {
  try {
    const buf = await readFile(join(outDir, relPath));
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function renderHtmlReport(
  scan: ScanResult,
  opts: { outDir: string; inlineImages: boolean },
): Promise<string> {
  const findings = scan.findings.filter((f) => f.status === 'finding');
  const passes = scan.findings.filter((f) => f.status === 'pass');
  const regressions = findings.filter((f) => f.regression);
  const evidenceById = new Map((scan.evidence?.artifacts ?? []).map((a) => [a.id, a]));

  const scenarioSections: string[] = [];
  for (const s of scan.scenarios) {
    const shots: string[] = [];
    if (opts.inlineImages) {
      for (const [key, id] of Object.entries(s.screenshots)) {
        const artifact = id ? evidenceById.get(id) : undefined;
        if (!artifact) continue;
        const uri = await imageDataUri(opts.outDir, artifact.artifactPath);
        if (uri) {
          shots.push(
            `<figure><img src="${uri}" alt="${esc(artifact.label)}" loading="lazy"/><figcaption>${esc(artifact.label)} <span class="mono muted">${esc(key)}</span></figcaption></figure>`,
          );
        }
      }
    }
    const cookieMap = new Map<string, CookieObservation & { phases: string[] }>();
    for (const [phase, list] of Object.entries(s.cookies)) {
      for (const c of list ?? []) {
        const key = `${c.name}|${c.domain}|${c.path}`;
        const existing = cookieMap.get(key);
        if (existing) existing.phases.push(phase);
        else cookieMap.set(key, { ...c, phases: [phase] });
      }
    }
    const cookieRows = [...cookieMap.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(
        (c) => `<tr>
        <td class="mono">${esc(c.name)}</td>
        <td class="mono muted">${esc(c.domain)}</td>
        <td><span class="cat cat-${esc(c.category)}">${esc(c.category.replace('_', ' '))}</span></td>
        <td>${esc(c.vendor ?? '—')}</td>
        <td>${c.firstParty ? 'First-party' : 'Third-party'}</td>
        <td class="muted">${esc(c.phases.join(', '))}</td>
      </tr>`,
      )
      .join('');
    const timelineRows = s.timeline
      .map(
        (e) => `<tr><td class="mono">${fmtMs(e.atMs)}</td><td class="mono muted">${esc(e.type)}</td><td>${esc(e.description)}</td></tr>`,
      )
      .join('');
    const trackingReqs = s.network.filter((n) => n.requestCategory === 'analytics' || n.requestCategory === 'advertising');
    scenarioSections.push(`
    <section class="card">
      <h3>${esc(SCENARIO_LABEL[s.scenario] ?? s.scenario)} <span class="muted status-${esc(s.status)}">${esc(s.status.replace(/_/g, ' '))}</span></h3>
      <div class="meta-grid">
        <div><span>CMP</span><p>${s.cmp.detected ? esc(s.cmp.provider ?? 'Custom banner detected') : 'Not detected'}</p></div>
        <div><span>Detection confidence</span><p>${(s.cmp.confidence * 100).toFixed(0)}%</p></div>
        <div><span>Consent action</span><p>${s.consentAction ? `Clicked “${esc(s.consentAction.buttonText)}” at +${fmtMs(s.consentAction.atMs)}` : '—'}</p></div>
        <div><span>Duration</span><p>${(s.durationMs / 1000).toFixed(1)} s</p></div>
        <div><span>Requests observed</span><p>${s.network.length} (${trackingReqs.length} tracking)</p></div>
        <div><span>Banner after reload</span><p>${s.bannerAfterReload === null ? '—' : s.bannerAfterReload ? 'Visible again' : 'Not shown'}</p></div>
      </div>
      ${s.observations.length ? `<p class="obs-list mono muted">Observations: ${esc(s.observations.slice(0, 8).join(' · '))}</p>` : ''}
      ${shots.length ? `<div class="shots">${shots.join('')}</div>` : ''}
      <details><summary>Cookies observed (${cookieMap.size})</summary>
        <table><thead><tr><th>Name</th><th>Domain</th><th>Category</th><th>Vendor</th><th>Party</th><th>Phases</th></tr></thead><tbody>${cookieRows || '<tr><td colspan="6" class="muted">None observed during this test.</td></tr>'}</tbody></table>
      </details>
      <details><summary>Event timeline (${s.timeline.length})</summary>
        <table><thead><tr><th>Time</th><th>Event</th><th>Description</th></tr></thead><tbody>${timelineRows}</tbody></table>
      </details>
    </section>`);
  }

  const matrix = matrixRows(scan);
  const scenarioHeads = scan.scenarios
    .filter((s) => s.status !== 'skipped')
    .map((s) => `<th>${esc(SCENARIO_LABEL[s.scenario] ?? s.scenario)}</th>`)
    .join('');
  const matrixHtml = matrix
    .map(
      (row) =>
        `<tr><td>${esc(row.label)}</td>${row.cells
          .map((c) => `<td class="tone-${c.tone}">${esc(c.text)}</td>`)
          .join('')}</tr>`,
    )
    .join('');

  const artifactRows = (scan.evidence?.artifacts ?? [])
    .map(
      (a) =>
        `<tr><td class="mono">${esc(a.artifactPath)}</td><td class="mono muted">${esc(a.sha256.slice(0, 20))}…</td><td class="muted">${a.bytes.toLocaleString()} B</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ConsentTrace evidence report — ${esc(scan.url)}</title>
<style>
  :root{--ink:#101828;--muted:#475467;--line:#eaecf0;--bg:#fcfcfd;--accent:#155eef}
  *{box-sizing:border-box}
  body{font-family:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;margin:0;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.55}
  .wrap{max-width:960px;margin:0 auto;padding:48px 32px 80px}
  header.rpt{border-bottom:1px solid var(--line);padding-bottom:24px;margin-bottom:32px}
  .brand{font-weight:700;letter-spacing:-.02em;font-size:15px}
  .brand span{color:var(--accent)}
  h1{font-size:26px;letter-spacing:-.02em;margin:14px 0 4px}
  h2{font-size:18px;letter-spacing:-.01em;margin:40px 0 12px}
  h3{font-size:15px;margin:0 0 12px}
  .muted{color:var(--muted)}
  .mono{font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12.5px}
  .meta-line{display:flex;gap:18px;flex-wrap:wrap;color:var(--muted);font-size:13px;margin-top:6px}
  .summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:20px 0}
  .stat{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:#fff}
  .stat b{display:block;font-size:22px;letter-spacing:-.02em}
  .stat span{color:var(--muted);font-size:12.5px}
  .card{border:1px solid var(--line);border-radius:12px;background:#fff;padding:20px 22px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}
  th{color:var(--muted);font-weight:500;text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);font-size:12px}
  td{padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  tr:last-child td{border-bottom:none}
  .tone-good{color:#067647}
  .tone-flag{color:#b42318;font-weight:600}
  .chip{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;letter-spacing:.02em}
  .chip-reg{background:#fef3f2;color:#b42318;border:1px solid #fecdca}
  .finding{border:1px solid var(--line);border-left:3px solid #d92d20;border-radius:10px;background:#fff;padding:16px 18px;margin-bottom:12px}
  .finding-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .finding .obs{margin:0 0 8px}
  .kv{display:flex;gap:12px;margin:4px 0}
  .kv span{min-width:76px;color:var(--muted);font-size:12px;padding-top:2px}
  .kv p{margin:0}
  .pass-list{margin:8px 0 0;padding:0;list-style:none}
  .pass-list li{padding:7px 0;border-bottom:1px solid var(--line);color:var(--muted)}
  .pass-list li b{color:#067647;font-weight:600;margin-right:8px}
  .meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:8px}
  .meta-grid span{color:var(--muted);font-size:12px}
  .meta-grid p{margin:2px 0 0;font-weight:500}
  .shots{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin:14px 0}
  figure{margin:0}
  figure img{width:100%;border:1px solid var(--line);border-radius:8px}
  figcaption{font-size:12px;color:var(--muted);margin-top:6px}
  details{margin-top:12px}
  summary{cursor:pointer;color:var(--accent);font-weight:500;font-size:13px}
  .cat{font-size:11.5px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);white-space:nowrap}
  .cat-advertising{background:#fef3f2;color:#b42318;border-color:#fecdca}
  .cat-analytics{background:#fffaeb;color:#b54708;border-color:#fedf89}
  .cat-functional{background:#f0f9ff;color:#026aa2;border-color:#b9e6fe}
  .cat-strictly_necessary{background:#f0fdf4;color:#067647;border-color:#abefc6}
  .cat-unknown{background:#f9fafb;color:#475467}
  .status-completed{color:#067647}
  .status-failed{color:#b42318}
  footer{margin-top:48px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:12.5px}
</style>
</head>
<body>
<div class="wrap">
  <header class="rpt">
    <div class="brand">Consent<span>Trace</span> · Evidence report</div>
    <h1>${esc(scan.url)}</h1>
    <div class="meta-line">
      <span>Scan ${esc(scan.scanId)}</span>
      <span>${esc(new Date(scan.startedAt).toUTCString())}</span>
      <span>${esc(scan.browser.name)} ${esc(scan.browser.version)}</span>
      <span>${scan.viewport.width}×${scan.viewport.height} · ${esc(scan.locale)}</span>
      <span>Scanner v${esc(scan.scannerVersion)} · Rule pack ${esc(scan.rulePackVersion)}</span>
      ${scan.baselineScanId ? `<span>Baseline ${esc(scan.baselineScanId)}</span>` : ''}
    </div>
  </header>

  <div class="summary">
    <div class="stat"><b>${scan.scenarios.filter((s) => s.status !== 'skipped').length}</b><span>Scenarios tested</span></div>
    <div class="stat"><b style="color:${findings.length ? '#b42318' : '#067647'}">${findings.length}</b><span>Findings</span></div>
    <div class="stat"><b style="color:${regressions.length ? '#b42318' : 'inherit'}">${regressions.length}</b><span>Regressions vs baseline</span></div>
    <div class="stat"><b>${passes.length}</b><span>Checks passed</span></div>
  </div>

  <h2>Consent-state matrix</h2>
  <div class="card">
    <table><thead><tr><th>Signal</th>${scenarioHeads}</tr></thead><tbody>${matrixHtml}</tbody></table>
    <p class="muted" style="margin:12px 0 0;font-size:12.5px">“None observed” means not observed during this test — it is not a claim that none exist.</p>
  </div>

  <h2>Findings</h2>
  ${findings.length ? findings.map(findingCard).join('') : '<div class="card"><p class="muted" style="margin:0">No rule findings during this test. Observations remain subject to the limitations below.</p></div>'}
  ${passes.length ? `<div class="card"><h3>Passed technical checks</h3><ul class="pass-list">${passes.map((p) => `<li><b>✓ ${esc(p.ruleId)}</b>${esc(p.observation)}</li>`).join('')}</ul></div>` : ''}

  <h2>Scenario evidence</h2>
  ${scenarioSections.join('')}

  <h2>Methodology &amp; limitations</h2>
  <div class="card">
    <p>Each scenario runs in a fresh, isolated browser context with cleared cookies and storage. ConsentTrace navigates to the target URL, detects the consent interface using deterministic signatures and heuristics, performs the scenario-specific consent action where applicable, waits a stabilization period, captures cookies, browser storage, network requests and screenshots, then reloads the page to test consent persistence. Cookie and request classifications come from a versioned knowledge base plus organization overrides; unmatched items are reported as <em>unknown</em>, never guessed.</p>
    <p class="muted">Limitations: results reflect the tested configuration, geography, browser build and timing of this scan only. Dynamic tag behavior, A/B tests, geo-targeting and later deployments can change behavior. Rule results are technical evaluations of browser observations — they are not legal conclusions.</p>
  </div>

  <h2>Evidence integrity</h2>
  <div class="card">
    <p class="mono" style="margin-top:0">Manifest SHA-256: ${esc(scan.evidence?.manifestSha256 ?? 'n/a')}</p>
    <details><summary>Artifact hashes (${scan.evidence?.artifacts.length ?? 0})</summary>
      <table><thead><tr><th>Artifact</th><th>SHA-256</th><th>Size</th></tr></thead><tbody>${artifactRows}</tbody></table>
    </details>
    <p class="muted" style="font-size:12.5px">Artifact hashes make this evidence package tamper-evident. They are not a legal certification.</p>
  </div>

  <footer>${esc(DISCLAIMER)}</footer>
</div>
</body>
</html>`;
}
