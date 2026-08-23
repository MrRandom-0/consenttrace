'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, ApiError, fmtDate, timeAgo } from '@/lib/client';
import { Card, Chip } from './ui';

interface KeysResponse {
  keys: Array<{ id: string; name: string; token_prefix: string; scope: string; created_at: string; last_used_at: string | null; revoked_at: string | null }>;
}

export function ApiKeysCard({ apiAccess }: { apiAccess: boolean }) {
  const queryClient = useQueryClient();
  const keys = useQuery({ queryKey: ['apikeys'], queryFn: () => api<KeysResponse>('/api/apikeys'), enabled: apiAccess });
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('write');
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const create = useMutation({
    mutationFn: () => api<{ token: string }>('/api/apikeys', { method: 'POST', json: { name, scope } }),
    onSuccess: (data) => {
      setNewToken(data.token);
      setName('');
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['apikeys'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Failed to create key.'),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/api/apikeys/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['apikeys'] }),
  });

  if (!apiAccess) {
    return (
      <Card title="API keys">
        <p className="muted text-[13px]">
          Programmatic access (trigger scans from CI, read findings, fetch evidence) is included in the Agency plan and
          above. Upgrade in Billing to create API keys.
        </p>
      </Card>
    );
  }

  return (
    <Card title="API keys">
      {newToken && (
        <div className="mb-3 rounded-lg border border-[color-mix(in_srgb,var(--good)_35%,transparent)] bg-[var(--good-soft)] p-3">
          <p className="text-[12.5px] font-semibold text-[var(--good)]">Key created — copy it now. It will not be shown again.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="mono flex-1 overflow-x-auto rounded bg-[var(--surface)] px-2 py-1.5 text-[11.5px]">{newToken}</code>
            <button
              type="button"
              className="btn btn-subtle"
              onClick={() => {
                void navigator.clipboard.writeText(newToken).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { setNewToken(null); setCopied(false); }}>
              Done
            </button>
          </div>
        </div>
      )}

      <form
        className="mb-3 flex flex-wrap items-end gap-2"
        onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
      >
        <label className="block min-w-[180px] flex-1">
          <span className="label">Key name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ci-github-actions" required />
        </label>
        <label className="block">
          <span className="label">Scope</span>
          <select className="input !w-auto" value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}>
            <option value="write">write (trigger scans)</option>
            <option value="read">read-only</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={create.isPending || !name.trim()}>
          {create.isPending ? 'Creating…' : 'Create key'}
        </button>
      </form>
      {error && <p className="mb-3 rounded-lg bg-[var(--bad-soft)] px-3 py-2 text-[12.5px] text-[var(--bad)]">{error}</p>}

      {(keys.data?.keys ?? []).length === 0 ? (
        <p className="muted text-[13px]">No API keys yet. Keys authenticate requests to /api/v1 via “Authorization: Bearer …”.</p>
      ) : (
        <table className="tbl">
          <thead><tr><th>Key</th><th>Scope</th><th>Created</th><th>Last used</th><th></th></tr></thead>
          <tbody>
            {(keys.data?.keys ?? []).map((key) => (
              <tr key={key.id}>
                <td>
                  <p className="font-medium">{key.name}</p>
                  <p className="mono muted text-[11px]">{key.token_prefix}…</p>
                </td>
                <td><Chip tone={key.scope === 'write' ? 'accent' : 'neutral'}>{key.scope}</Chip></td>
                <td className="muted">{fmtDate(key.created_at)}</td>
                <td className="muted">{key.last_used_at ? timeAgo(key.last_used_at) : 'never'}</td>
                <td className="text-right">
                  {key.revoked_at ? (
                    <Chip tone="bad">revoked</Chip>
                  ) : (
                    <button type="button" className="btn btn-ghost !text-[var(--bad)]" onClick={() => revoke.mutate(key.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted mt-2 text-[11.5px]">
        Tokens are stored hashed — treat them like passwords. Docs: <span className="mono">docs/API.md</span> (endpoints, pagination, Idempotency-Key).
      </p>
    </Card>
  );
}
