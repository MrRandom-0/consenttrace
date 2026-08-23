'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, timeAgo } from '@/lib/client';
import { Card, Chip, EmptyState, statusTone } from '@/components/ui';

interface SitesResponse {
  sites: Array<{
    id: string; name: string; primary_url: string; environment_id: string; created_at: string;
    latest_scan_id: string | null; latest_scan_status: string | null; latest_scan_at: string | null;
    latest_summary: { findingCount: number; regressionCount: number } | null;
  }>;
}

export default function SitesPage() {
  const queryClient = useQueryClient();
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api<SitesResponse>('/api/sites'), refetchInterval: 7000 });
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api('/api/sites', { method: 'POST', json: { name, url, authorized } }),
    onSuccess: () => {
      setShowForm(false); setName(''); setUrl(''); setAuthorized(false); setError(null);
      void queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to add site.'),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold tracking-tight">Sites</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : 'Add site'}
        </button>
      </div>

      {showForm && (
        <Card title="Add a site">
          <form
            className="space-y-4"
            onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="label">Site name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Northwind Outfitters" required />
              </label>
              <label className="block">
                <span className="label">URL to test</span>
                <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.example.com" required />
              </label>
            </div>
            <label className="flex items-start gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <input type="checkbox" className="mt-0.5" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} required />
              <span className="text-[12.5px] leading-relaxed">
                I confirm this organization owns this website or is authorized to test it. Automated scanning of websites you
                are not authorized to test is prohibited. Higher scan volume requires domain verification.
              </span>
            </label>
            {error && <p className="rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--bad)]">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={create.isPending || !authorized}>
              {create.isPending ? 'Adding…' : 'Add site'}
            </button>
          </form>
        </Card>
      )}

      {sites.data && sites.data.sites.length === 0 && !showForm ? (
        <EmptyState
          title="No sites yet"
          body="Add the first website you're authorized to test. ConsentTrace will scan its consent states from clean browser contexts and keep the evidence."
          action={<button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>Add your first site</button>}
        />
      ) : (
        <Card>
          <table className="tbl">
            <thead>
              <tr><th>Site</th><th>Latest scan</th><th>Findings</th><th>Last activity</th></tr>
            </thead>
            <tbody>
              {(sites.data?.sites ?? []).map((site) => (
                <tr key={site.id} className="tbl-row-link" onClick={() => (window.location.href = `/app/sites/${site.id}`)}>
                  <td>
                    <p className="font-semibold">{site.name}</p>
                    <p className="mono muted text-[11.5px]">{site.primary_url}</p>
                  </td>
                  <td>{site.latest_scan_status ? <Chip tone={statusTone(site.latest_scan_status)}>{site.latest_scan_status}</Chip> : <span className="muted">never scanned</span>}</td>
                  <td>
                    {site.latest_summary ? (
                      site.latest_summary.findingCount > 0 ? (
                        <span className="font-semibold text-[var(--bad)]">{site.latest_summary.findingCount}</span>
                      ) : (
                        <span className="text-[var(--good)]">0</span>
                      )
                    ) : '—'}
                  </td>
                  <td className="muted">{timeAgo(site.latest_scan_at ?? site.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
