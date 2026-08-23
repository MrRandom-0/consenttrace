/**
 * Evidence export — everything stays local to the user's machine.
 * JSON: machine-readable session evidence with artifact hashes.
 * HTML: self-contained, client-shareable report in the ConsentTrace design language.
 */
import { DISCLAIMER, SCANNER_VERSION } from '@consenttrace/shared';
import { fmtMs } from './format';
import { sha256Hex } from './hash';
import type { QuickSession } from './types';

export async function buildExportJson(session: QuickSession): Promise<string> {
  const artifacts = [
    { name: 'cookies_baseline', json: session.snapshots.baseline?.cookies ?? [] },
    { name: 'cookies_after_action', json: session.snapshots.afterAction?.cookies ?? [] },
    { name: 'cookies_after_reload', json: session.snapshots.afterReload?.cookies ?? [] },
    { name: 'storage_baseline', json: session.snapshots.baseline?.storage ?? [] },
    { name: 'resources_baseline', json: session.snapshots.baseline?.resources ?? [] },
    { name: 'timeline', json: session.timeline },
    { name: 'findings', json: session.findings },
  ];
  const hashes: Record<string, string> = {};
  for (const artifact of artifacts) hashes[artifact.name] = await sha256Hex(JSON.stringify(artifact.json));
  for (const shot of session.screenshots) hashes[`screenshot:${shot.label}`] = shot.sha256 ?? '';

  return JSON.stringify(
    {
      product: 'ConsentTrace Extension',
      extensionVersion: SCANNER_VERSION,
      exportedAt: new Date().toISOString(),
      disclaimer: DISCLAIMER,
      page: { url: session.url, origin: session.origin, title: session.title },
      capturedAt: new Date(session.startedAtEpoch).toISOString(),
      cmp: session.cmp,
      candidates: session.candidates,
      action: session.action,
      snapshots: session.snapshots,
      screenshots: session.screenshots.map((s) => ({ label: s.label, atMs: s.atMs, sha256: s.sha256, dataUrl: s.dataUrl })),
      timeline: session.timeline,
      findings: session.findings,
      observations: session.observations,
      artifactHashes: hashes,
    },
    null,
    2,
  );
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SEV: Record<string, string> = { critical: '#b42318', high: '#d92d20', medium: '#dc6803', low: '#ca8504', info: '#475467' };

export async function buildExportHtml(session: QuickSession): Promise<string> {
  const findings = session.findings.filter((f) => f.status === 'finding');
  const passes = session.findings.filter((f) => f.status === 'pass');
  const latest = session.snapshots.afterReload ?? session.snapshots.afterAction ?? session.snapshots.baseline;
  const cookieRows = (latest?.cookies ?? [])
    .map(
      (c) =>
        `<tr><td class="mono">${esc(c.name)}</td><td class="mono muted">${esc(c.domain)}</td><td>${esc(c.category.replace('_', ' '))}</td><td>${esc(c.vendor ?? '—')}</td><td>${c.firstParty ? 'First-party' : 'Third-party'}</td></tr>`,
    )
    .join('');
  const trackingReqs = (latest?.resources ?? []).filter((r) => r.category === 'analytics' || r.category === 'advertising');
  const requestRows = trackingReqs
    .map((r) => `<tr><td class="mono">${esc(r.domain)}</td><td>${esc(r.category)}</td><td>${esc(r.vendor ?? '—')}</td><td class="mono">+${fmtMs(r.startMs)}</td></tr>`)
    .join('');
  const timelineRows = session.timeline
    .map((e) => `<tr><td class="mono">${fmtMs(e.atMs)}</td><td class="mono muted">${esc(e.type)}</td><td>${esc(e.description)}</td></tr>`)
    .join('');
  const shots = session.screenshots
    // Defense in depth: only chrome-generated PNG data URIs are ever embedded.
    .filter((s) => s.dataUrl.startsWith('data:image/png;base64,') && /^[A-Za-z0-9+/=]+$/.test(s.dataUrl.slice(22)))
    .map(
      (s) =>
        `<figure><img src="${s.dataUrl}" alt="${esc(s.label)}"/><figcaption>${esc(s.label)} · +${fmtMs(s.atMs)}${s.sha256 ? ` · <span class="mono">${esc(s.sha256.slice(0, 16))}…</span>` : ''}</figcaption></figure>`,
    )
    .join('');
  const findingCards = findings
    .map(
      (f) => `<div class="finding"><div class="fh"><span class="chip" style="color:${SEV[f.severity] ?? '#475467'}">${esc(f.severity.toUpperCase())}</span><strong>${esc(f.ruleId)} — ${esc(f.name)}</strong></div><p>${esc(f.observation)}</p></div>`,
    )
    .join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ConsentTrace evidence — ${esc(session.origin)}</title>
<style>
body{font-family:'Inter',system-ui,sans-serif;margin:0;background:#fcfcfd;color:#101828;font-size:14px;line-height:1.55}
.wrap{max-width:880px;margin:0 auto;padding:40px 28px 64px}.brand{font-weight:700;font-size:15px}.brand span{color:#155eef}
h1{font-size:22px;margin:12px 0 4px;letter-spacing:-.02em}h2{font-size:16px;margin:32px 0 10px}
.muted{color:#475467}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px}
.card{border:1px solid #eaecf0;border-radius:12px;background:#fff;padding:18px 20px;margin-bottom:14px}
table{width:100%;border-collapse:collapse;font-size:13px}th{color:#475467;font-weight:500;text-align:left;padding:7px 9px;border-bottom:1px solid #eaecf0;font-size:12px}
td{padding:7px 9px;border-bottom:1px solid #f2f4f7;vertical-align:top}tr:last-child td{border-bottom:none}
.finding{border:1px solid #eaecf0;border-left:3px solid #d92d20;border-radius:10px;background:#fff;padding:14px 16px;margin-bottom:10px}
.fh{display:flex;gap:8px;align-items:center;margin-bottom:6px}.chip{font-size:11px;font-weight:700}
figure{margin:0 0 14px}figure img{width:100%;border:1px solid #eaecf0;border-radius:8px}figcaption{font-size:12px;color:#475467;margin-top:6px}
.passes li{color:#475467;padding:4px 0}footer{margin-top:40px;border-top:1px solid #eaecf0;padding-top:16px;color:#475467;font-size:12.5px}
</style></head><body><div class="wrap">
<div class="brand">Consent<span>Trace</span> · Extension evidence</div>
<h1>${esc(session.origin)}</h1>
<p class="muted">${esc(session.title)} · captured ${esc(new Date(session.startedAtEpoch).toUTCString())} · live browser session (not a clean profile)</p>
<h2>Summary</h2>
<div class="card"><p style="margin:0">CMP: <strong>${session.cmp?.detected ? esc(session.cmp.provider ?? 'Custom banner') : 'Not detected'}</strong> · Action: <strong>${session.action ? esc(`${session.action.kind} — “${session.action.buttonText}”`) : 'None performed'}</strong> · Findings: <strong>${findings.length}</strong>${session.snapshots.afterReload ? ` · Preference after reload: <strong>${session.snapshots.afterReload.bannerVisible ? 'banner shown again' : 'persisted'}</strong>` : ''}</p></div>
<h2>Findings</h2>
${findingCards || '<div class="card"><p class="muted" style="margin:0">No rule findings during this check.</p></div>'}
${passes.length ? `<div class="card"><ul class="passes" style="margin:0;padding-left:16px">${passes.map((p) => `<li>✓ ${esc(p.ruleId)} — ${esc(p.observation)}</li>`).join('')}</ul></div>` : ''}
<h2>Cookies observed (${latest?.cookies.length ?? 0})</h2>
<div class="card"><table><thead><tr><th>Name</th><th>Domain</th><th>Category</th><th>Vendor</th><th>Party</th></tr></thead><tbody>${cookieRows || '<tr><td colspan="5" class="muted">None observed during this check.</td></tr>'}</tbody></table></div>
<h2>Tracking requests (${trackingReqs.length})</h2>
<div class="card"><table><thead><tr><th>Domain</th><th>Category</th><th>Vendor</th><th>Started</th></tr></thead><tbody>${requestRows || '<tr><td colspan="4" class="muted">None observed during this check.</td></tr>'}</tbody></table></div>
${shots ? `<h2>Screenshots</h2>${shots}` : ''}
<h2>Event timeline</h2>
<div class="card"><table><thead><tr><th>Time</th><th>Event</th><th>Description</th></tr></thead><tbody>${timelineRows}</tbody></table></div>
<footer>${esc(DISCLAIMER)} Captured with the ConsentTrace extension in a live browser profile; observations reflect this profile's existing state. All evidence remained local to this browser.</footer>
</div></body></html>`;
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function exportBaseName(session: QuickSession): string {
  const host = session.origin.replace(/^https?:\/\//, '').replace(/[^a-z0-9.-]/gi, '_');
  const stamp = new Date(session.startedAtEpoch).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `consenttrace_${host}_${stamp}`;
}
