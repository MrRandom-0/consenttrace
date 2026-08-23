'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, fmtDate } from '@/lib/client';
import { Card, Chip, EmptyState, Stat, statusTone } from '@/components/ui';

interface MeResponse {
  org: { name: string; plan: string };
  entitlements: { maxSites: number; maxMonthlyScans: number };
  usage: { sites: number; scansThisMonth: number };
}
interface SitesResponse {
  sites: Array<{
    id: string; name: string; primary_url: string; environment_id: string;
    latest_scan_id: string | null; latest_scan_status: string | null; latest_scan_at: string | null;
    latest_summary: { findingCount: number; regressionCount: number } | null;
  }>;
}
interface ScansResponse {
  scans: Array<{ id: string; status: string; created_at: string; completed_at: string | null; site_name: string; summary: { findingCount: number; regressionCount: number } | null; trigger_type: string }>;
}

export default function OverviewPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/api/me') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api<SitesResponse>('/api/sites') });
  const scans = useQuery({ queryKey: ['scans'], queryFn: () => api<ScansResponse>('/api/scans?limit=8'), refetchInterval: 5000 });

  const attention = (sites.data?.sites ?? []).filter((s) => (s.latest_summary?.findingCount ?? 0) > 0 || s.latest_scan_status === 'failed');
  const healthy = (sites.data?.sites ?? []).filter((s) => s.latest_scan_status === 'completed' && (s.latest_summary?.findingCount ?? 0) === 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Overview</h1>
        <Link href="/app/sites" className="btn btn-primary">Add a site</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Monitored sites" value={sites.data ? sites.data.sites.length : '—'} />
        <Stat label="Healthy on latest scan" value={sites.data ? healthy.length : '—'} tone="good" />
        <Stat label="Require attention" value={sites.data ? attention.length : '—'} tone={attention.length ? 'bad' : 'neutral'} />
        <Stat
          label={`Scans this month${me.data ? ` / ${me.data.entitlements.maxMonthlyScans}` : ''}`}
          value={me.data ? me.data.usage.scansThisMonth : '—'}
        />
      </div>

      {attention.length > 0 && (
        <Card title="Requires attention">
          <div className="space-y-2">
            {attention.map((site) => (
              <Link key={site.id} href={site.latest_scan_id ? `/app/scans/${site.latest_scan_id}` : `/app/sites/${site.id}`} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--line)] p-3 hover:bg-[var(--surface-2)]">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold">{site.name}</p>
                  <p className="mono muted truncate text-[11.5px]">{site.primary_url}</p>
                </div>
                <div className="flex items-center gap-2">
                  {site.latest_scan_status === 'failed' && <Chip tone="bad">scan failed</Chip>}
                  {(site.latest_summary?.regressionCount ?? 0) > 0 && <Chip tone="bad">{site.latest_summary!.regressionCount} regression(s)</Chip>}
                  {(site.latest_summary?.findingCount ?? 0) > 0 && <Chip tone="bad">{site.latest_summary!.findingCount} finding(s)</Chip>}
                </div>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card title="Recent scans" right={<Link className="text-[12px] font-semibold text-[var(--accent)]" href="/app/scans">View all</Link>}>
        {scans.data && scans.data.scans.length === 0 ? (
          <EmptyState title="No scans yet" body="Add a site and run your first consent scan — no-action, reject and accept states in isolated browser contexts." action={<Link href="/app/sites" className="btn btn-primary">Add a site</Link>} />
        ) : (
          <table className="tbl">
            <thead>
              <tr><th>Site</th><th>Status</th><th>Findings</th><th>Trigger</th><th>When</th></tr>
            </thead>
            <tbody>
              {(scans.data?.scans ?? []).map((scan) => (
                <tr key={scan.id} className="tbl-row-link" onClick={() => (window.location.href = `/app/scans/${scan.id}`)}>
                  <td className="font-medium">{scan.site_name}</td>
                  <td><Chip tone={statusTone(scan.status)}>{scan.status}</Chip></td>
                  <td>
                    {scan.summary ? (
                      scan.summary.findingCount > 0 ? (
                        <span className="font-semibold text-[var(--bad)]">{scan.summary.findingCount}{scan.summary.regressionCount > 0 ? ` (${scan.summary.regressionCount} regression)` : ''}</span>
                      ) : (
                        <span className="text-[var(--good)]">0</span>
                      )
                    ) : '—'}
                  </td>
                  <td className="muted">{scan.trigger_type.replace('_', ' ')}</td>
                  <td className="muted">{fmtDate(scan.completed_at ?? scan.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
