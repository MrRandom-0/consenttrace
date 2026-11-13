'use client';

/** Scan-detail building blocks. Every value renders from the deterministic ScanResult JSON. */
import { useMemo, useState } from 'react';
import type { CookieObservation, RuleResult, ScanResult, ScenarioResult } from '@consenttrace/shared';
import { compareScanResults, type ScenarioComparison } from '@consenttrace/scanner-core';
import { fmtMs } from '@/lib/client';
import { Card, categoryTone, Chip, severityTone, Stat } from './ui';

const SCENARIO_LABEL: Record<string, string> = {
  no_action: 'No action',
  accept_all: 'Accept all',
  reject_all: 'Reject all',
  essential_only: 'Essential only',
  custom_preferences: 'Custom preferences',
  withdraw_consent: 'Withdraw consent',
};

function settledCookies(s: ScenarioResult): CookieObservation[] {
  return s.cookies.after_settle ?? s.cookies.after_page_load ?? [];
}
function postActionNetwork(s: ScenarioResult) {
  if (s.consentAction) return s.network.filter((n) => n.atMs > s.consentAction!.atMs);
  return s.network;
}

export function ScenarioCards({ result }: { result: ScanResult }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {result.scenarios.map((s) => {
        const cookies = settledCookies(s);
        const tracking = s.network.filter((n) => n.requestCategory === 'analytics' || n.requestCategory === 'advertising').length;
        return (
          <div key={s.scenario} className="card p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[13px] font-semibold">{SCENARIO_LABEL[s.scenario] ?? s.scenario}</p>
              <Chip tone={s.status === 'completed' ? 'good' : s.status === 'failed' ? 'bad' : 'warn'}>{s.status.replace(/_/g, ' ')}</Chip>
            </div>
            <dl className="space-y-1 text-[12px]">
              <div className="flex justify-between"><dt className="muted">CMP</dt><dd className="font-medium">{s.cmp.detected ? (s.cmp.provider ?? 'custom') : 'not detected'}</dd></div>
              <div className="flex justify-between"><dt className="muted">Action</dt><dd className="max-w-[55%] truncate font-medium">{s.consentAction ? `“${s.consentAction.buttonText}”` : '—'}</dd></div>
              <div className="flex justify-between"><dt className="muted">Cookies</dt><dd className="font-medium">{cookies.length}</dd></div>
              <div className="flex justify-between"><dt className="muted">Tracking requests</dt><dd className={`font-medium ${tracking > 0 && (s.scenario === 'no_action' || s.scenario === 'reject_all') ? 'text-[var(--bad)]' : ''}`}>{tracking}</dd></div>
              <div className="flex justify-between"><dt className="muted">Banner after reload</dt><dd className="font-medium">{s.bannerAfterReload === null ? '—' : s.bannerAfterReload ? 'shown again' : 'not shown'}</dd></div>
            </dl>
          </div>
        );
      })}
    </div>
  );
}

export function ConsentMatrix({ result }: { result: ScanResult }) {
  const scenarios = result.scenarios.filter((s) => s.status !== 'skipped');
  const cookieRow = (label: string, category: string, flagIn: string[]) => ({
    label,
    cells: scenarios.map((s) => {
      const count = settledCookies(s).filter((c) => c.category === category).length;
      const flagged = flagIn.includes(s.scenario) && count > 0;
      return { text: count > 0 ? `Observed (${count})` : 'None observed', flagged, good: flagIn.includes(s.scenario) && count === 0 };
    }),
  });
  const requestRow = (label: string, category: string) => ({
    label,
    cells: scenarios.map((s) => {
      const count = postActionNetwork(s).filter((n) => n.requestCategory === category).length;
      const sensitive = s.scenario === 'no_action' || s.scenario === 'reject_all';
      return { text: count > 0 ? `Observed (${count})` : 'None observed', flagged: sensitive && count > 0, good: sensitive && count === 0 };
    }),
  });
  const rows = [
    cookieRow('Necessary cookies', 'strictly_necessary', []),
    cookieRow('Functional cookies', 'functional', []),
    cookieRow('Analytics cookies', 'analytics', ['no_action', 'reject_all']),
    cookieRow('Advertising cookies', 'advertising', ['no_action', 'reject_all']),
    cookieRow('Unclassified cookies', 'unknown', []),
    requestRow('Analytics requests', 'analytics'),
    requestRow('Advertising requests', 'advertising'),
    {
      label: 'Consent preference',
      cells: scenarios.map((s) => ({
        text: s.scenario === 'no_action' ? 'Pending' : s.consentAction ? (s.scenario === 'accept_all' ? 'Granted' : 'Rejected') : 'Action not found',
        flagged: s.scenario !== 'no_action' && !s.consentAction,
        good: false,
      })),
    },
    {
      label: 'Preference persisted after reload',
      cells: scenarios.map((s) => ({
        text: s.bannerAfterReload === null ? '—' : s.bannerAfterReload ? 'Banner shown again' : 'Persisted',
        flagged: s.bannerAfterReload === true,
        good: s.bannerAfterReload === false,
      })),
    },
  ];
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr><th>Signal</th>{scenarios.map((s) => <th key={s.scenario}>{SCENARIO_LABEL[s.scenario] ?? s.scenario}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="font-medium">{row.label}</td>
              {row.cells.map((cell, i) => (
                <td key={i} className={cell.flagged ? 'font-semibold text-[var(--bad)]' : cell.good ? 'text-[var(--good)]' : 'muted'}>{cell.text}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted mt-2 text-[11.5px]">“None observed” means not observed during this test — not a claim that none exist.</p>
    </div>
  );
}

export function FindingsList({ findings }: { findings: RuleResult[] }) {
  const [showPasses, setShowPasses] = useState(false);
  const open = findings.filter((f) => f.status === 'finding');
  const passes = findings.filter((f) => f.status === 'pass');
  return (
    <div className="space-y-2">
      {open.length === 0 && <p className="muted text-[13px]">No rule findings during this scan.</p>}
      {open.map((f, i) => (
        <div key={i} className="rounded-lg border border-[var(--line)] border-l-2 border-l-[var(--bad)] p-3">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <Chip tone={severityTone(f.severity)}>{f.severity.toUpperCase()}</Chip>
            {f.regression && <Chip tone="bad">REGRESSION</Chip>}
            <span className="text-[13px] font-semibold">{f.ruleId} · {f.name}</span>
            {f.scenario && <span className="muted text-[12px]">· {SCENARIO_LABEL[f.scenario] ?? f.scenario}</span>}
          </div>
          <p className="text-[13px] leading-relaxed">{f.observation}</p>
          {f.expectedBehavior && (
            <div className="mt-2 grid gap-1 text-[12px] md:grid-cols-2">
              <p><span className="muted">Expected:</span> {f.expectedBehavior}</p>
              <p><span className="muted">Actual:</span> {f.actualBehavior}</p>
            </div>
          )}
          {f.evidenceIds.length > 0 && <p className="mono muted mt-1.5 text-[11px]">Evidence: {f.evidenceIds.join(', ')}</p>}
        </div>
      ))}
      {passes.length > 0 && (
        <div>
          <button type="button" className="cursor-pointer border-none bg-transparent p-0 text-[12px] font-semibold text-[var(--accent)]" onClick={() => setShowPasses((v) => !v)}>
            {showPasses ? 'Hide passed checks' : `Passed checks (${passes.length})`}
          </button>
          {showPasses && (
            <ul className="mt-1.5 space-y-1">
              {passes.map((p, i) => (
                <li key={i} className="muted flex gap-1.5 text-[12px]">
                  <span className="font-bold text-[var(--good)]">✓ {p.ruleId}</span>
                  <span>{p.observation}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type TabKey = 'cookies' | 'requests' | 'storage' | 'timeline' | 'screenshots';

export function EvidenceTabs({ result, scanId }: { result: ScanResult; scanId: string }) {
  const [tab, setTab] = useState<TabKey>('cookies');
  const [scenarioKey, setScenarioKey] = useState(result.scenarios[0]?.scenario ?? 'no_action');
  const scenario = result.scenarios.find((s) => s.scenario === scenarioKey) ?? result.scenarios[0];
  const artifactById = useMemo(() => new Map((result.evidence?.artifacts ?? []).map((a) => [a.id, a])), [result]);
  if (!scenario) return null;

  const cookies = [...settledCookies(scenario)].sort((a, b) => a.name.localeCompare(b.name));
  const requests = scenario.network.filter((n) => n.thirdParty || n.requestCategory !== 'unknown');
  const storage = scenario.storage.after_settle ?? scenario.storage.after_page_load ?? [];
  const screenshots = Object.entries(scenario.screenshots)
    .map(([key, id]) => ({ key, artifact: id ? artifactById.get(id) : undefined }))
    .filter((s) => s.artifact);

  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'cookies', label: 'Cookies', count: cookies.length },
    { key: 'requests', label: 'Requests', count: requests.length },
    { key: 'storage', label: 'Storage', count: storage.length },
    { key: 'timeline', label: 'Timeline', count: scenario.timeline.length },
    { key: 'screenshots', label: 'Screenshots', count: screenshots.length },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg bg-[var(--surface-2)] p-0.5" role="tablist" aria-label="Evidence tabs">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold ${tab === t.key ? 'bg-[var(--surface)] shadow-sm' : 'text-[var(--muted)]'}`}>
              {t.label} <span className="mono muted">{t.count}</span>
            </button>
          ))}
        </div>
        <select className="input !w-auto" value={scenarioKey} onChange={(e) => setScenarioKey(e.target.value as typeof scenarioKey)} aria-label="Scenario">
          {result.scenarios.map((s) => <option key={s.scenario} value={s.scenario}>{SCENARIO_LABEL[s.scenario] ?? s.scenario}</option>)}
        </select>
      </div>

      {tab === 'cookies' && (
        <table className="tbl">
          <thead><tr><th>Name</th><th>Domain</th><th>Category</th><th>Vendor</th><th>Party</th><th>Attributes</th></tr></thead>
          <tbody>
            {cookies.length === 0 && <tr><td colSpan={6} className="muted">None observed during this test.</td></tr>}
            {cookies.map((c) => (
              <tr key={`${c.name}|${c.domain}|${c.path}`}>
                <td className="mono font-semibold">{c.name}</td>
                <td className="mono muted">{c.domain}</td>
                <td><Chip tone={categoryTone(c.category)}>{c.category === 'strictly_necessary' ? 'necessary' : c.category}</Chip></td>
                <td>{c.vendor ?? '—'}</td>
                <td>{c.firstParty ? '1st-party' : '3rd-party'}</td>
                <td className="muted text-[11.5px]">{[c.session ? 'session' : 'persistent', c.secure && 'Secure', c.httpOnly && 'HttpOnly', c.sameSite !== 'unspecified' && c.sameSite].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'requests' && (
        <table className="tbl">
          <thead><tr><th>Domain</th><th>Category</th><th>Vendor</th><th>Type</th><th>At</th><th>Status</th></tr></thead>
          <tbody>
            {requests.length === 0 && <tr><td colSpan={6} className="muted">No third-party or classified requests observed.</td></tr>}
            {requests.map((r, i) => (
              <tr key={i}>
                <td className="mono">{r.domain}</td>
                <td><Chip tone={categoryTone(r.requestCategory)}>{r.requestCategory}</Chip></td>
                <td>{r.vendor ?? '—'}</td>
                <td className="muted">{r.resourceType}</td>
                <td className="mono muted">+{fmtMs(r.atMs)}</td>
                <td className="mono muted">{r.status ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'storage' && (
        <table className="tbl">
          <thead><tr><th>Key</th><th>Store</th><th>Value hash</th><th>Length</th></tr></thead>
          <tbody>
            {storage.length === 0 && <tr><td colSpan={4} className="muted">No storage keys observed.</td></tr>}
            {storage.map((s, i) => (
              <tr key={i}>
                <td className="mono font-semibold">{s.key}</td>
                <td className="muted">{s.kind}</td>
                <td className="mono muted">{s.valueHash}</td>
                <td className="muted">{s.valueLength}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {tab === 'timeline' && (
        <div className="space-y-1.5">
          {scenario.timeline.map((e, i) => (
            <div key={i} className="flex gap-3 border-b border-[var(--line)] pb-1.5 text-[12.5px] last:border-0">
              <span className="mono muted w-[72px] flex-none">{fmtMs(e.atMs)}</span>
              <span className="mono muted w-[130px] flex-none truncate">{e.type}</span>
              <span>{e.description}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'screenshots' && (
        <div className="grid gap-4 md:grid-cols-2">
          {screenshots.length === 0 && <p className="muted text-[13px]">No screenshots for this scenario.</p>}
          {screenshots.map(({ key, artifact }) => (
            <figure key={key} className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/scans/${scanId}/artifacts/${artifact!.artifactPath}`} alt={artifact!.label} className="w-full rounded-lg border border-[var(--line)]" loading="lazy" />
              <figcaption className="muted mt-1 text-[11.5px]">
                {artifact!.label} · <span className="mono">{artifact!.sha256.slice(0, 16)}…</span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function DomainChips({ added, removed, trackingAdded }: { added: string[]; removed: string[]; trackingAdded?: Set<string> }) {
  if (added.length === 0 && removed.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {added.map((d) => (
        <span key={`a-${d}`} className="mono rounded-md bg-[var(--bad-soft)] px-2 py-0.5 text-[11.5px] text-[var(--bad)]" title={trackingAdded?.has(d) ? 'New tracking domain' : 'New domain'}>
          + {d}{trackingAdded?.has(d) ? ' · tracking' : ''}
        </span>
      ))}
      {removed.map((d) => (
        <span key={`r-${d}`} className="mono rounded-md bg-[var(--good-soft)] px-2 py-0.5 text-[11.5px] text-[var(--good)]" title="Domain no longer observed">
          − {d}
        </span>
      ))}
    </div>
  );
}

function ScenarioDiff({ diff }: { diff: ScenarioComparison }) {
  const { cookies, domains, trackingDomains, storageKeys } = diff;
  const trackingAdded = new Set(trackingDomains.added);
  const changed =
    cookies.added.length + cookies.removed.length + cookies.changed.length +
    domains.added.length + domains.removed.length + storageKeys.added.length + storageKeys.removed.length > 0 ||
    diff.bannerAfterReload.before !== diff.bannerAfterReload.after;
  return (
    <Card title={SCENARIO_LABEL[diff.scenario] ?? diff.scenario} right={!changed ? <Chip tone="good">no changes</Chip> : undefined}>
      {!changed ? (
        <p className="muted text-[13px]">Cookies, domains, storage and banner behaviour are identical in both scans.</p>
      ) : (
        <div className="space-y-3.5">
          {(cookies.added.length > 0 || cookies.removed.length > 0) && (
            <table className="tbl">
              <thead><tr><th>Change</th><th>Cookie</th><th>Domain</th><th>Category</th><th>Vendor</th></tr></thead>
              <tbody>
                {cookies.added.map((c) => (
                  <tr key={`a-${c.name}|${c.domain}|${c.path}`}>
                    <td className="font-semibold text-[var(--bad)]">+ added</td>
                    <td className="mono font-semibold">{c.name}</td>
                    <td className="mono muted">{c.domain}</td>
                    <td><Chip tone={categoryTone(c.category)}>{c.category === 'strictly_necessary' ? 'necessary' : c.category}</Chip></td>
                    <td>{c.vendor ?? '—'}</td>
                  </tr>
                ))}
                {cookies.removed.map((c) => (
                  <tr key={`r-${c.name}|${c.domain}|${c.path}`}>
                    <td className="font-semibold text-[var(--good)]">− removed</td>
                    <td className="mono font-semibold">{c.name}</td>
                    <td className="mono muted">{c.domain}</td>
                    <td><Chip tone={categoryTone(c.category)}>{c.category === 'strictly_necessary' ? 'necessary' : c.category}</Chip></td>
                    <td>{c.vendor ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cookies.changed.length > 0 && (
            <div>
              <p className="mb-1 text-[12px] font-semibold">Changed cookies</p>
              <ul className="space-y-1 text-[12.5px]">
                {cookies.changed.map((ch) => (
                  <li key={`${ch.after.name}|${ch.after.domain}|${ch.after.path}`}>
                    <span className="mono font-semibold">{ch.after.name}</span>{' '}
                    <span className="muted">— {ch.changedFields.join(', ')} changed</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(domains.added.length > 0 || domains.removed.length > 0) && (
            <div>
              <p className="mb-1.5 text-[12px] font-semibold">Request domains</p>
              <DomainChips added={domains.added} removed={domains.removed} trackingAdded={trackingAdded} />
            </div>
          )}
          {(storageKeys.added.length > 0 || storageKeys.removed.length > 0) && (
            <div>
              <p className="mb-1 text-[12px] font-semibold">Storage keys</p>
              <ul className="space-y-0.5 text-[12.5px]">
                {storageKeys.added.map((k) => <li key={`a-${k}`} className="mono text-[var(--bad)]">+ {k}</li>)}
                {storageKeys.removed.map((k) => <li key={`r-${k}`} className="mono text-[var(--good)]">− {k}</li>)}
              </ul>
            </div>
          )}
          {diff.bannerAfterReload.before !== diff.bannerAfterReload.after && (
            <p className="text-[12.5px]">
              <span className="font-semibold">Banner after reload:</span>{' '}
              <span className="muted">
                {diff.bannerAfterReload.before === null ? 'not checked' : diff.bannerAfterReload.before ? 'shown again' : 'persisted'}
                {' → '}
                {diff.bannerAfterReload.after === null ? 'not checked' : diff.bannerAfterReload.after ? 'shown again' : 'persisted'}
              </span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Full "what changed" view between two scan results, rendered from compareScanResults. */
export function CompareView({ before, after }: { before: ScanResult; after: ScanResult }) {
  const cmp = useMemo(() => compareScanResults(before, after), [before, after]);
  const s = cmp.summary;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="New findings" value={s.findingsAppeared} tone={s.findingsAppeared > 0 ? 'bad' : 'good'} />
        <Stat label="Resolved findings" value={s.findingsResolved} tone={s.findingsResolved > 0 ? 'good' : 'neutral'} />
        <Stat label="Cookies added" value={s.cookiesAdded} />
        <Stat label="Cookies removed" value={s.cookiesRemoved} />
        <Stat label="Tracking domains +" value={s.trackingDomainsAdded} tone={s.trackingDomainsAdded > 0 ? 'bad' : 'good'} />
        <Stat label="Tracking domains −" value={s.trackingDomainsRemoved} tone={s.trackingDomainsRemoved > 0 ? 'good' : 'neutral'} />
      </div>

      <Card title={`New findings (${cmp.findings.appeared.length})`} right={cmp.findings.appeared.length === 0 ? <Chip tone="good">none</Chip> : <Chip tone="bad">appeared</Chip>}>
        {cmp.findings.appeared.length === 0
          ? <p className="muted text-[13px]">No rule findings appeared in the newer scan.</p>
          : <FindingsList findings={cmp.findings.appeared} />}
      </Card>
      <Card title={`Resolved findings (${cmp.findings.resolved.length})`} right={cmp.findings.resolved.length > 0 ? <Chip tone="good">resolved</Chip> : undefined}>
        {cmp.findings.resolved.length === 0
          ? <p className="muted text-[13px]">No earlier findings were resolved in the newer scan.</p>
          : <FindingsList findings={cmp.findings.resolved} />}
      </Card>

      {cmp.scenarios.map((diff) => <ScenarioDiff key={diff.scenario} diff={diff} />)}

      {(cmp.onlyInBefore.length > 0 || cmp.onlyInAfter.length > 0) && (
        <p className="muted text-[12px]">
          {cmp.onlyInBefore.length > 0 && <>Scenarios only in the earlier scan: {cmp.onlyInBefore.map((k) => SCENARIO_LABEL[k] ?? k).join(', ')}. </>}
          {cmp.onlyInAfter.length > 0 && <>Scenarios only in the newer scan: {cmp.onlyInAfter.map((k) => SCENARIO_LABEL[k] ?? k).join(', ')}.</>}
        </p>
      )}
    </div>
  );
}
