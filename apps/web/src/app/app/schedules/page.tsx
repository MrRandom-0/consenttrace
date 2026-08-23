'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, fmtDate } from '@/lib/client';
import { Card, Chip, EmptyState } from '@/components/ui';

interface SchedulesResponse {
  schedules: Array<{ id: string; cron: string; enabled: boolean; scenarios: string[]; next_run_at: string | null; last_run_at: string | null; site_name: string; base_url: string }>;
}
interface SitesResponse {
  sites: Array<{ id: string; name: string; environment_id: string }>;
}

const PRESETS = [
  { label: 'Daily at 07:00', cron: '0 7 * * *' },
  { label: 'Daily at 22:00', cron: '0 22 * * *' },
  { label: 'Every Monday at 07:00', cron: '0 7 * * 1' },
  { label: 'Every Friday at 18:00', cron: '0 18 * * 5' },
];

export default function SchedulesPage() {
  const queryClient = useQueryClient();
  const schedules = useQuery({ queryKey: ['schedules'], queryFn: () => api<SchedulesResponse>('/api/schedules') });
  const sites = useQuery({ queryKey: ['sites'], queryFn: () => api<SitesResponse>('/api/sites') });
  const [environmentId, setEnvironmentId] = useState('');
  const [cron, setCron] = useState(PRESETS[0]!.cron);
  const [error, setError] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['schedules'] });
  const create = useMutation({
    mutationFn: () => api('/api/schedules', { method: 'POST', json: { siteEnvironmentId: environmentId, cron } }),
    onSuccess: () => { setError(null); invalidate(); },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create schedule.'),
  });
  const toggle = useMutation({
    mutationFn: (args: { id: string; enabled: boolean }) => api(`/api/schedules/${args.id}`, { method: 'PATCH', json: { enabled: args.enabled } }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/api/schedules/${id}`, { method: 'DELETE' }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold tracking-tight">Schedules</h1>

      <Card title="New schedule">
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (environmentId) create.mutate(); }}>
          <label className="block min-w-[220px] flex-1">
            <span className="label">Site</span>
            <select className="input" value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} required>
              <option value="" disabled>Choose a site…</option>
              {(sites.data?.sites ?? []).map((s) => <option key={s.environment_id} value={s.environment_id}>{s.name}</option>)}
            </select>
          </label>
          <label className="block min-w-[200px]">
            <span className="label">Frequency</span>
            <select className="input" value={cron} onChange={(e) => setCron(e.target.value)}>
              {PRESETS.map((p) => <option key={p.cron} value={p.cron}>{p.label}</option>)}
            </select>
          </label>
          <button type="submit" className="btn btn-primary" disabled={create.isPending || !environmentId}>
            {create.isPending ? 'Creating…' : 'Create schedule'}
          </button>
        </form>
        {error && <p className="mt-3 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--bad)]">{error}</p>}
        <p className="muted mt-3 text-[11.5px]">Scheduled runs scan no-action, reject and accept states and compare against the site&apos;s pinned baseline. Times use server time for now.</p>
      </Card>

      {schedules.data && schedules.data.schedules.length === 0 ? (
        <EmptyState title="No schedules" body="Create a daily or weekly schedule to catch consent regressions the day a deployment introduces them." />
      ) : (
        <Card>
          <table className="tbl">
            <thead><tr><th>Site</th><th>Frequency</th><th>Status</th><th>Next run</th><th>Last run</th><th></th></tr></thead>
            <tbody>
              {(schedules.data?.schedules ?? []).map((schedule) => (
                <tr key={schedule.id}>
                  <td>
                    <p className="font-medium">{schedule.site_name}</p>
                    <p className="mono muted text-[11px]">{schedule.base_url}</p>
                  </td>
                  <td className="mono">{schedule.cron}</td>
                  <td><Chip tone={schedule.enabled ? 'good' : 'neutral'}>{schedule.enabled ? 'active' : 'paused'}</Chip></td>
                  <td className="muted">{fmtDate(schedule.next_run_at)}</td>
                  <td className="muted">{fmtDate(schedule.last_run_at)}</td>
                  <td className="text-right">
                    <button type="button" className="btn btn-ghost" onClick={() => toggle.mutate({ id: schedule.id, enabled: !schedule.enabled })}>
                      {schedule.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" className="btn btn-ghost !text-[var(--bad)]" onClick={() => remove.mutate(schedule.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
