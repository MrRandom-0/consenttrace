'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, fmtDate, timeAgo } from '@/lib/client';
import { Card, Chip, severityTone, statusTone } from '@/components/ui';

function VerificationHelp({ siteId, token, url }: { siteId: string; token: string | null; url: string }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const verify = useMutation({
    mutationFn: (method: string) => api<{ verified: boolean }>(`/api/sites/${siteId}/verify`, { method: 'POST', json: { method } }),
    onSuccess: (data) => {
      if (data.verified) void queryClient.invalidateQueries({ queryKey: ['site', siteId] });
      else setMessage('Verification not found yet — records and files can take a few minutes to propagate.');
    },
    onError: (err) => setMessage(err instanceof ApiError ? err.message : 'Verification check failed.'),
  });
  const host = (() => { try { return new URL(url).hostname; } catch { return url; } })();
  return (
    <div className="space-y-3">
      <p className="muted text-[12.5px]">
        Unverified sites are limited to a small number of scans per month. Prove control of the domain with any one method,
        then click its check button:
      </p>
      <ol className="space-y-2 text-[12.5px]">
        <li>
          <span className="font-semibold">1 · DNS TXT</span> — add a TXT record on <span className="mono">{host}</span>:{' '}
          <code className="mono rounded bg-[var(--surface-2)] px-1.5 py-0.5">consenttrace-verify={token ?? '…'}</code>
        </li>
        <li>
          <span className="font-semibold">2 · Meta tag</span> — add to your homepage <span className="mono">&lt;head&gt;</span>:{' '}
          <code className="mono rounded bg-[var(--surface-2)] px-1.5 py-0.5">&lt;meta name=&quot;consenttrace-verification&quot; content=&quot;{token ?? '…'}&quot;&gt;</code>
        </li>
        <li>
          <span className="font-semibold">3 · File</span> — serve <span className="mono">/.well-known/consenttrace-verify.txt</span>{' '}
          containing exactly <code className="mono rounded bg-[var(--surface-2)] px-1.5 py-0.5">{token ?? '…'}</code>
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-subtle" disabled={verify.isPending} onClick={() => verify.mutate('dns_txt')}>Check DNS TXT</button>
        <button type="button" className="btn btn-subtle" disabled={verify.isPending} onClick={() => verify.mutate('html_meta')}>Check meta tag</button>
        <button type="button" className="btn btn-subtle" disabled={verify.isPending} onClick={() => verify.mutate('file')}>Check file</button>
      </div>
      {message && <p className="rounded-lg bg-[var(--warn-soft)] px-3 py-2 text-[12px] text-[var(--warn)]">{message}</p>}
    </div>
  );
}

interface SiteDetail {
  site: {
    id: string; name: string; primary_url: string; environment_id: string; base_url: string;
    authorized_confirmed_at: string | null; created_at: string;
    verification_token: string | null; verified_at: string | null; verification_method: string | null; verified_domain: string | null;
  };
  scans: Array<{ id: string; status: string; trigger_type: string; created_at: string; completed_at: string | null; summary: { findingCount: number; regressionCount: number } | null; error_code: string | null; baseline_scan_id: string | null }>;
  baseline: { scan_id: string; note: string | null; created_at: string } | null;
  schedules: Array<{ id: string; cron: string; enabled: boolean; next_run_at: string | null }>;
  openFindings: Array<{ rule_id: string; severity: string; title: string; observation: string; regression: boolean; scan_id: string; first_detected_at: string }>;
}

export default function SiteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['site', id], queryFn: () => api<SiteDetail>(`/api/sites/${id}`), refetchInterval: 5000 });

  const runScan = useMutation({
    mutationFn: () => api<{ scan: { id: string } }>('/api/scans', { method: 'POST', json: { siteEnvironmentId: detail.data!.site.environment_id } }),
    onSuccess: (data) => { window.location.href = `/app/scans/${data.scan.id}`; },
  });

  if (detail.isLoading) return <p className="muted">Loading…</p>;
  if (!detail.data) return <p className="muted">Site not found.</p>;
  const { site, scans, baseline, schedules, openFindings } = detail.data;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{site.name}</h1>
          <p className="mono muted text-[12px]">{site.base_url}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => runScan.mutate()} disabled={runScan.isPending}>
            {runScan.isPending ? 'Queueing…' : 'Run scan'}
          </button>
        </div>
      </div>
      {runScan.error && (
        <p className="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--bad)]">
          {runScan.error instanceof ApiError ? runScan.error.message : 'Could not queue the scan.'}
        </p>
      )}

      <Card title="Domain verification" right={site.verified_at ? <Chip tone="good">verified · {site.verification_method}</Chip> : <Chip tone="warn">unverified</Chip>}>
        {site.verified_at ? (
          <p className="muted text-[13px]">
            Verified {timeAgo(site.verified_at)} for <span className="mono">{site.verified_domain}</span>. Verified sites have no
            monthly verification cap on scans.
          </p>
        ) : (
          <VerificationHelp siteId={site.id} token={site.verification_token} url={site.base_url} />
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Baseline">
          {baseline ? (
            <div className="space-y-1">
              <p className="text-[13px]">
                Pinned to scan <Link className="mono font-semibold text-[var(--accent)]" href={`/app/scans/${baseline.scan_id}`}>{baseline.scan_id.slice(0, 8)}…</Link>
              </p>
              {baseline.note && <p className="muted text-[12.5px]">“{baseline.note}”</p>}
              <p className="muted text-[11.5px]">Set {timeAgo(baseline.created_at)}. New scans compare against this baseline (rules CT-008…CT-010).</p>
            </div>
          ) : (
            <p className="muted text-[13px]">No baseline yet. Open a good completed scan and choose “Set as baseline” — subsequent scans will diff against it.</p>
          )}
        </Card>
        <Card title="Schedules">
          {schedules.length === 0 ? (
            <p className="muted text-[13px]">
              No schedule for this site. <Link href="/app/schedules" className="font-semibold text-[var(--accent)]">Create one</Link> to monitor consent behavior daily or weekly.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {schedules.map((schedule) => (
                <li key={schedule.id} className="flex items-center justify-between text-[13px]">
                  <span className="mono">{schedule.cron}</span>
                  <span className="flex items-center gap-2">
                    <Chip tone={schedule.enabled ? 'good' : 'neutral'}>{schedule.enabled ? 'active' : 'paused'}</Chip>
                    <span className="muted text-[11.5px]">next {fmtDate(schedule.next_run_at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {openFindings.length > 0 && (
        <Card title={`Open findings (${openFindings.length})`}>
          <div className="space-y-2">
            {openFindings.map((finding, i) => (
              <Link key={i} href={`/app/scans/${finding.scan_id}`} className="block rounded-lg border border-[var(--line)] border-l-2 border-l-[var(--bad)] p-3 hover:bg-[var(--surface-2)]">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <Chip tone={severityTone(finding.severity)}>{finding.severity.toUpperCase()}</Chip>
                  {finding.regression && <Chip tone="bad">REGRESSION</Chip>}
                  <span className="text-[12.5px] font-semibold">{finding.rule_id} · {finding.title}</span>
                </div>
                <p className="muted line-clamp-2 text-[12.5px]">{finding.observation}</p>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Scan history (${scans.length})`}>
        <table className="tbl">
          <thead><tr><th>Scan</th><th>Status</th><th>Findings</th><th>Trigger</th><th>When</th></tr></thead>
          <tbody>
            {scans.map((scan) => (
              <tr key={scan.id} className="tbl-row-link" onClick={() => (window.location.href = `/app/scans/${scan.id}`)}>
                <td className="mono text-[12px]">
                  {scan.id.slice(0, 8)}…{baseline?.scan_id === scan.id && <Chip tone="accent">baseline</Chip>}
                </td>
                <td><Chip tone={statusTone(scan.status)}>{scan.status}</Chip>{scan.error_code && <span className="mono muted ml-1 text-[11px]">{scan.error_code}</span>}</td>
                <td>{scan.summary ? (scan.summary.findingCount > 0 ? <span className="font-semibold text-[var(--bad)]">{scan.summary.findingCount}</span> : <span className="text-[var(--good)]">0</span>) : '—'}</td>
                <td className="muted">{scan.trigger_type.replace('_', ' ')}</td>
                <td className="muted">{fmtDate(scan.completed_at ?? scan.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
