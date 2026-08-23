'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ScanResult } from '@consenttrace/shared';
import { api, fmtDate } from '@/lib/client';
import { Card, Chip, Spinner, statusTone } from '@/components/ui';
import { ConsentMatrix, EvidenceTabs, FindingsList, ScenarioCards } from '@/components/ScanView';

interface ScanDetail {
  scan: {
    id: string; status: string; trigger_type: string; created_at: string; started_at: string | null; completed_at: string | null;
    scanner_version: string | null; rule_pack_version: string | null; browser_version: string | null;
    error_code: string | null; error_message: string | null; baseline_scan_id: string | null; report_artifact_path: string | null;
  };
  site: { site_id: string; site_name: string; base_url: string } | null;
  result: ScanResult | null;
  isBaseline: boolean;
  activeBaseline: { scan_id: string; note: string | null } | null;
}

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['scan', id],
    queryFn: () => api<ScanDetail>(`/api/scans/${id}?include=result`),
    refetchInterval: (query) => {
      const status = query.state.data?.scan.status;
      return status === 'queued' || status === 'running' ? 2500 : false;
    },
  });

  const setBaseline = useMutation({
    mutationFn: () => api(`/api/scans/${id}/baseline`, { method: 'POST', json: { note: 'Set from dashboard' } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['scan', id] }),
  });

  if (detail.isLoading) return <p className="muted">Loading…</p>;
  if (!detail.data) return <p className="muted">Scan not found.</p>;
  const { scan, site, result, isBaseline } = detail.data;
  const running = scan.status === 'queued' || scan.status === 'running';
  const findings = result?.findings.filter((f) => f.status === 'finding') ?? [];
  const durationSec =
    scan.started_at && scan.completed_at
      ? Math.round((new Date(scan.completed_at).getTime() - new Date(scan.started_at).getTime()) / 1000)
      : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-bold tracking-tight">{site?.site_name ?? 'Scan'}</h1>
            <Chip tone={statusTone(scan.status)}>{scan.status}</Chip>
            {isBaseline && <Chip tone="accent">baseline</Chip>}
            {running && <Spinner />}
          </div>
          <p className="mono muted mt-0.5 text-[12px]">{site?.base_url}</p>
          <p className="muted mt-1 text-[12px]">
            {fmtDate(scan.created_at)} · {scan.trigger_type.replace('_', ' ')}
            {durationSec !== null && ` · completed in ${durationSec}s`}
            {scan.scanner_version && ` · scanner v${scan.scanner_version} · rules ${scan.rule_pack_version}`}
            {scan.baseline_scan_id && ' · compared to baseline'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {scan.report_artifact_path && (
            <a className="btn btn-subtle" href={`/api/scans/${scan.id}/artifacts/report.html`} target="_blank" rel="noopener noreferrer">
              Open evidence report
            </a>
          )}
          {scan.status === 'completed' && !isBaseline && (
            <button type="button" className="btn btn-primary" onClick={() => setBaseline.mutate()} disabled={setBaseline.isPending}>
              {setBaseline.isPending ? 'Setting…' : 'Set as baseline'}
            </button>
          )}
        </div>
      </div>

      {running && (
        <Card>
          <p className="text-[13.5px]">
            <span className="font-semibold">Scan in progress.</span>{' '}
            <span className="muted">Isolated browser contexts are running the consent scenarios — this page updates automatically.</span>
          </p>
        </Card>
      )}

      {scan.status === 'failed' && (
        <Card title="Scan failed">
          <p className="mono text-[13px] text-[var(--bad)]">{scan.error_code}</p>
          {scan.error_message && <p className="muted mt-1 text-[12.5px]">{scan.error_message}</p>}
        </Card>
      )}

      {result && (
        <>
          <ScenarioCards result={result} />
          <Card title="Consent-state matrix"><ConsentMatrix result={result} /></Card>
          <Card
            title={`Findings (${findings.length})`}
            right={findings.length === 0 ? <Chip tone="good">clean</Chip> : findings.some((f) => f.regression) ? <Chip tone="bad">regression</Chip> : undefined}
          >
            <FindingsList findings={result.findings} />
          </Card>
          <Card title="Evidence"><EvidenceTabs result={result} scanId={scan.id} /></Card>
          {result.evidence && (
            <p className="mono muted text-[11.5px]">
              Evidence manifest sha256 {result.evidence.manifestSha256} · {result.evidence.artifacts.length} artifacts ·{' '}
              <Link className="text-[var(--accent)]" href={`/api/scans/${scan.id}/artifacts/manifest.json`} target="_blank">manifest.json</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
