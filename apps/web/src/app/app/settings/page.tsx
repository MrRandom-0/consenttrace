'use client';

import { useQuery } from '@tanstack/react-query';
import { api, fmtDate } from '@/lib/client';
import { Card, Chip } from '@/components/ui';

interface MeResponse { org: { id: string; name: string; slug: string; plan: string; role: string } }
interface TeamResponse { members: Array<{ id: string; email: string; name: string | null; role: string; joined_at: string }> }
interface AuditResponse { events: Array<{ id: string; event: string; resource_type: string; resource_id: string; created_at: string; actor_email: string | null; metadata: Record<string, unknown> }> }

export default function SettingsPage() {
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/api/me') });
  const team = useQuery({ queryKey: ['team'], queryFn: () => api<TeamResponse>('/api/team') });
  const auditLog = useQuery({ queryKey: ['audit'], queryFn: () => api<AuditResponse>('/api/audit?limit=30') });

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold tracking-tight">Settings</h1>

      <Card title="Workspace">
        {me.data ? (
          <dl className="grid gap-3 text-[13px] md:grid-cols-3">
            <div><dt className="muted text-[11.5px]">Name</dt><dd className="font-semibold">{me.data.org.name}</dd></div>
            <div><dt className="muted text-[11.5px]">Slug</dt><dd className="mono">{me.data.org.slug}</dd></div>
            <div><dt className="muted text-[11.5px]">Plan</dt><dd><Chip tone="accent">{me.data.org.plan}</Chip></dd></div>
          </dl>
        ) : <p className="muted">Loading…</p>}
      </Card>

      <Card title="Team">
        <table className="tbl">
          <thead><tr><th>Member</th><th>Role</th><th>Joined</th></tr></thead>
          <tbody>
            {(team.data?.members ?? []).map((member) => (
              <tr key={member.id}>
                <td>
                  <p className="font-medium">{member.name ?? member.email}</p>
                  <p className="muted text-[11.5px]">{member.email}</p>
                </td>
                <td><Chip tone={member.role === 'owner' ? 'accent' : 'neutral'}>{member.role}</Chip></td>
                <td className="muted">{fmtDate(member.joined_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted mt-2 text-[11.5px]">Email invitations ship with the notification service. Roles: owner · admin · analyst · viewer (docs/AUTHORIZATION.md).</p>
      </Card>

      <Card title="Audit log">
        {(auditLog.data?.events ?? []).length === 0 ? (
          <p className="muted text-[13px]">Workspace events will appear here.</p>
        ) : (
          <div className="space-y-1">
            {(auditLog.data?.events ?? []).map((event) => (
              <div key={event.id} className="flex flex-wrap items-baseline gap-2 border-b border-[var(--line)] py-1.5 text-[12.5px] last:border-0">
                <span className="mono muted w-[130px] flex-none">{fmtDate(event.created_at)}</span>
                <Chip>{event.event}</Chip>
                <span className="mono muted">{event.resource_type}/{event.resource_id.slice(0, 8)}</span>
                <span className="muted">{event.actor_email ?? 'system'}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Data & evidence">
        <p className="text-[13px]">
          Cookie and storage values are stored as SHA-256 digests only. Evidence artifacts are hashed and sealed in
          per-scan manifests. Retention follows your plan; site, workspace and account deletion cascade to evidence.
        </p>
        <p className="muted mt-2 text-[11.5px]">
          ConsentTrace provides automated technical observations about website consent behavior. It does not provide legal
          advice or certify regulatory compliance.
        </p>
      </Card>
    </div>
  );
}
