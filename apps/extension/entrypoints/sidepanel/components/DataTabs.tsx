import { useState } from 'react';
import { Card, Chip, categoryTone } from './ui';
import { fmtMs } from '../../../lib/format';
import type { PanelSnapshot, QuickSession } from '../../../lib/types';

type TabKey = 'cookies' | 'requests' | 'storage';

export function DataTabs({ session }: { session: QuickSession }) {
  const [tab, setTab] = useState<TabKey>('cookies');
  const snapshot: PanelSnapshot | undefined =
    session.snapshots.afterReload ?? session.snapshots.afterAction ?? session.snapshots.baseline;
  if (!snapshot) return null;

  const trackingRequests = snapshot.resources.filter((r) => r.category === 'analytics' || r.category === 'advertising');
  const otherThirdParty = snapshot.resources.filter(
    (r) => r.thirdParty && r.category !== 'analytics' && r.category !== 'advertising',
  );
  const tabs: Array<{ key: TabKey; label: string; count: number }> = [
    { key: 'cookies', label: 'Cookies', count: snapshot.cookies.length },
    { key: 'requests', label: 'Requests', count: trackingRequests.length + otherThirdParty.length },
    { key: 'storage', label: 'Storage', count: snapshot.storage.length },
  ];

  return (
    <Card
      title="Observed state"
      right={<span className="mono muted">{session.snapshots.afterReload ? 'after reload' : session.snapshots.afterAction ? 'after action' : 'baseline'}</span>}
    >
      <div role="tablist" aria-label="Observed data" className="mb-2 flex gap-1 rounded-lg bg-[var(--bg)] p-0.5">
        {tabs.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className="tab flex-1" onClick={() => setTab(t.key)}>
            {t.label} <span className="mono muted">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'cookies' && (
        <div className="max-h-64 overflow-y-auto">
          {snapshot.cookies.length === 0 && <p className="muted p-1 text-[12px]">None observed during this check.</p>}
          {[...snapshot.cookies]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => (
              <div key={`${c.name}|${c.domain}|${c.path}`} className="row-line flex items-center gap-2 py-1.5">
                <div className="min-w-0 flex-1">
                  <p className="mono truncate text-[11.5px] font-semibold" title={`${c.name} · ${c.domain}${c.path}`}>
                    {c.name}
                  </p>
                  <p className="muted truncate text-[10.5px]">
                    {c.vendor ?? c.domain} · {c.firstParty ? '1st-party' : '3rd-party'} · {c.session ? 'session' : 'persistent'}
                    {c.httpOnly ? ' · HttpOnly' : ''}
                  </p>
                </div>
                <Chip tone={categoryTone(c.category)}>{c.category === 'strictly_necessary' ? 'necessary' : c.category}</Chip>
              </div>
            ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="max-h-64 overflow-y-auto">
          {trackingRequests.length === 0 && otherThirdParty.length === 0 && (
            <p className="muted p-1 text-[12px]">No third-party requests observed during this check.</p>
          )}
          {trackingRequests.map((r, i) => (
            <div key={`t-${i}`} className="row-line flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="mono truncate text-[11.5px] font-semibold" title={r.urlNormalized}>
                  {r.domain}
                </p>
                <p className="muted text-[10.5px]">
                  {r.vendor ?? 'Unknown vendor'} · {r.initiatorType} · +{fmtMs(r.startMs)}
                </p>
              </div>
              <Chip tone={categoryTone(r.category)}>{r.category}</Chip>
            </div>
          ))}
          {otherThirdParty.length > 0 && (
            <p className="muted mt-1.5 text-[10.5px]">
              + {otherThirdParty.length} other third-party request(s):{' '}
              {[...new Set(otherThirdParty.map((r) => r.domain))].slice(0, 4).join(', ')}
              {new Set(otherThirdParty.map((r) => r.domain)).size > 4 ? '…' : ''}
            </p>
          )}
        </div>
      )}

      {tab === 'storage' && (
        <div className="max-h-64 overflow-y-auto">
          {snapshot.storage.length === 0 && <p className="muted p-1 text-[12px]">No storage keys observed.</p>}
          {snapshot.storage.map((s, i) => (
            <div key={i} className="row-line flex items-center gap-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="mono truncate text-[11.5px] font-semibold">{s.key}</p>
                <p className="muted text-[10.5px]">
                  {s.kind} · {s.valueLength} chars · <span className="mono">{s.valueHash.slice(0, 18)}…</span>
                </p>
              </div>
            </div>
          ))}
          <p className="muted mt-1.5 text-[10.5px]">Values are hashed before display or export — raw values are never stored.</p>
        </div>
      )}
    </Card>
  );
}
