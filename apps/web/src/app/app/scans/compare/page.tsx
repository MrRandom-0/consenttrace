'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ScanResult } from '@consenttrace/shared';
import { api, fmtDate } from '@/lib/client';
import { Card, EmptyState } from '@/components/ui';
import { CompareView } from '@/components/ScanView';

interface ScanListItem {
  id: string; status: string; created_at: string; completed_at: string | null;
  site_name: string; base_url: string;
}
interface ScansResponse { scans: ScanListItem[] }
interface ScanDetail {
  scan: { id: string; status: string };
  site: { site_id: string; site_name: string; base_url: string } | null;
  result: ScanResult | null;
}

function scanLabel(s: ScanListItem): string {
  return `${s.site_name} · ${fmtDate(s.completed_at ?? s.created_at)}`;
}

function CompareInner() {
  const params = useSearchParams();
  const [fromId, setFromId] = useState<string>(params.get('from') ?? '');
  const [toId, setToId] = useState<string>(params.get('to') ?? '');

  const scans = useQuery({ queryKey: ['scans', 'all'], queryFn: () => api<ScansResponse>('/api/scans?limit=60') });
  const completed = (scans.data?.scans ?? []).filter((s) => s.status === 'completed');

  // Sensible defaults: newest completed scan vs the previous completed scan of the same site.
  useEffect(() => {
    if (completed.length === 0) return;
    if (!toId) {
      const newest = completed[0]!;
      setToId(newest.id);
      if (!fromId) {
        const older = completed.find((s) => s.id !== newest.id && s.base_url === newest.base_url) ?? completed.find((s) => s.id !== newest.id);
        if (older) setFromId(older.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scans.data]);

  const before = useQuery({
    queryKey: ['scan', fromId],
    queryFn: () => api<ScanDetail>(`/api/scans/${fromId}?include=result`),
    enabled: !!fromId,
  });
  const after = useQuery({
    queryKey: ['scan', toId],
    queryFn: () => api<ScanDetail>(`/api/scans/${toId}?include=result`),
    enabled: !!toId,
  });

  const ready = before.data?.result && after.data?.result && fromId !== toId;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">Compare scans</h1>
        <p className="muted mt-1 text-[13px]">
          What changed between two scans — findings that appeared or resolved, and per-scenario cookie, domain and storage differences.
        </p>
      </div>

      <Card>
        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold">Earlier scan</span>
            <select className="input" value={fromId} onChange={(e) => setFromId(e.target.value)} aria-label="Earlier scan">
              <option value="">Select a scan…</option>
              {completed.map((s) => <option key={s.id} value={s.id}>{scanLabel(s)}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-subtle"
            disabled={!fromId || !toId}
            onClick={() => { setFromId(toId); setToId(fromId); }}
          >
            ⇄ Swap
          </button>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold">Newer scan</span>
            <select className="input" value={toId} onChange={(e) => setToId(e.target.value)} aria-label="Newer scan">
              <option value="">Select a scan…</option>
              {completed.map((s) => <option key={s.id} value={s.id}>{scanLabel(s)}</option>)}
            </select>
          </label>
        </div>
        {before.data?.site && after.data?.site && before.data.site.site_id !== after.data.site.site_id && (
          <p className="mt-3 rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-[12px] text-[var(--warn)]">
            These scans are for different sites ({before.data.site.site_name} vs {after.data.site.site_name}) — differences will include everything that differs between the sites.
          </p>
        )}
      </Card>

      {completed.length < 2 && !scans.isLoading && (
        <EmptyState title="Not enough scans to compare" body="Run at least two scans — for example a scan before and after a deploy — then come back here to see exactly what changed." />
      )}
      {fromId && toId && fromId === toId && (
        <EmptyState title="Same scan selected twice" body="Pick two different scans to see what changed between them." />
      )}
      {(before.isLoading || after.isLoading) && fromId && toId && fromId !== toId && <p className="muted">Loading scan evidence…</p>}
      {ready && <CompareView before={before.data!.result!} after={after.data!.result!} />}
    </div>
  );
}

export default function CompareScansPage() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <CompareInner />
    </Suspense>
  );
}
