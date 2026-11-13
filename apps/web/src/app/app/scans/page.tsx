'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, fmtDate } from '@/lib/client';
import { Card, Chip, EmptyState, statusTone } from '@/components/ui';

interface ScansResponse {
  scans: Array<{
    id: string; status: string; trigger_type: string; created_at: string; completed_at: string | null;
    summary: { findingCount: number; regressionCount: number } | null; error_code: string | null;
    site_name: string; base_url: string; baseline_scan_id: string | null;
  }>;
}

export default function ScansPage() {
  const scans = useQuery({ queryKey: ['scans', 'all'], queryFn: () => api<ScansResponse>('/api/scans?limit=60'), refetchInterval: 5000 });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[22px] font-bold tracking-tight">Scans</h1>
        <Link className="btn btn-subtle" href="/app/scans/compare">Compare scans</Link>
      </div>
      {scans.data && scans.data.scans.length === 0 ? (
        <EmptyState title="No scans yet" body="Trigger your first scan from a site page. Each scan tests no-action, reject and accept states in isolated browser contexts." />
      ) : (
        <Card>
          <table className="tbl">
            <thead><tr><th>Site</th><th>Status</th><th>Findings</th><th>Compared to baseline</th><th>Trigger</th><th>When</th></tr></thead>
            <tbody>
              {(scans.data?.scans ?? []).map((scan) => (
                <tr key={scan.id} className="tbl-row-link" onClick={() => (window.location.href = `/app/scans/${scan.id}`)}>
                  <td>
                    <p className="font-medium">{scan.site_name}</p>
                    <p className="mono muted text-[11px]">{scan.base_url}</p>
                  </td>
                  <td><Chip tone={statusTone(scan.status)}>{scan.status}</Chip>{scan.error_code && <span className="mono muted ml-1 text-[11px]">{scan.error_code}</span>}</td>
                  <td>
                    {scan.summary ? (
                      scan.summary.findingCount > 0 ? (
                        <span className="font-semibold text-[var(--bad)]">
                          {scan.summary.findingCount}
                          {scan.summary.regressionCount > 0 && <Chip tone="bad">regression</Chip>}
                        </span>
                      ) : (
                        <span className="text-[var(--good)]">0</span>
                      )
                    ) : '—'}
                  </td>
                  <td className="muted">{scan.baseline_scan_id ? 'yes' : '—'}</td>
                  <td className="muted">{scan.trigger_type.replace('_', ' ')}</td>
                  <td className="muted">{fmtDate(scan.completed_at ?? scan.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
