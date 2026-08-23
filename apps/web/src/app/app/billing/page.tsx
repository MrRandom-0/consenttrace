'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/client';
import { Card, Chip } from '@/components/ui';

interface MeResponse {
  org: { plan: string; role: string };
  entitlements: { maxSites: number; maxMonthlyScans: number; scheduledScans: boolean; brandedReports: boolean; evidenceRetentionDays: number; maxMembers: number };
  usage: { sites: number; scansThisMonth: number; members: number };
  billing: { stripeConfigured: boolean; devMode: boolean };
  plans: Array<{ id: string; label: string; priceMonthlyUsd: number | null; blurb: string; entitlements: MeResponse['entitlements'] }>;
}

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(max, 1)) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-[12px]">
        <span className="muted">{label}</span>
        <span className="font-semibold">{used} / {max}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-[var(--bad)]' : 'bg-[var(--accent)]'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<MeResponse>('/api/me') });
  const switchPlan = useMutation({
    mutationFn: (plan: string) => api('/api/billing/plan', { method: 'POST', json: { plan } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  const checkout = useMutation({
    mutationFn: (plan: string) => api<{ url: string }>('/api/billing/checkout', { method: 'POST', json: { plan } }),
    onSuccess: (data) => { window.location.href = data.url; },
  });

  if (!me.data) return <p className="muted">Loading…</p>;
  const { org, entitlements, usage, plans, billing } = me.data;
  const isOwner = org.role === 'owner';
  const upgrade = (plan: string) => (billing.stripeConfigured ? checkout.mutate(plan) : switchPlan.mutate(plan));
  const upgradeBusy = switchPlan.isPending || checkout.isPending;

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-bold tracking-tight">Billing</h1>

      <Card title="Current usage" right={<Chip tone="accent">{org.plan}</Chip>}>
        <div className="grid gap-4 md:grid-cols-3">
          <UsageBar label="Sites" used={usage.sites} max={entitlements.maxSites} />
          <UsageBar label="Scans this month" used={usage.scansThisMonth} max={entitlements.maxMonthlyScans} />
          <UsageBar label="Team members" used={usage.members} max={entitlements.maxMembers} />
        </div>
        <p className="muted mt-3 text-[12px]">Evidence retention: {entitlements.evidenceRetentionDays} days · Scheduled scans: {entitlements.scheduledScans ? 'included' : 'not included'} · Branded reports: {entitlements.brandedReports ? 'included' : 'not included'}</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-4">
        {plans.map((plan) => (
          <Card key={plan.id} className={plan.id === org.plan ? '!border-[var(--accent)]' : ''}>
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold">{plan.label}</h3>
              {plan.id === org.plan && <Chip tone="accent">current</Chip>}
            </div>
            <p className="mt-1 text-[22px] font-bold">
              {plan.priceMonthlyUsd === null ? 'Custom' : `$${plan.priceMonthlyUsd}`}
              {plan.priceMonthlyUsd ? <span className="muted text-[12px] font-medium">/mo</span> : null}
            </p>
            <p className="muted text-[12px]">{plan.blurb}</p>
            <ul className="muted mt-3 space-y-1 text-[12px]">
              <li>{plan.entitlements.maxSites} sites</li>
              <li>{plan.entitlements.maxMonthlyScans.toLocaleString()} scans/mo</li>
              <li>{plan.entitlements.evidenceRetentionDays}-day retention</li>
            </ul>
            {plan.id !== org.plan && plan.priceMonthlyUsd !== null && plan.priceMonthlyUsd > 0 && (
              <button type="button" className="btn btn-subtle mt-3 w-full" disabled={!isOwner || upgradeBusy} onClick={() => upgrade(plan.id)}
                title={isOwner ? '' : 'Only the workspace owner can change the plan'}>
                {upgradeBusy ? 'Working…' : billing.stripeConfigured ? `Upgrade via Stripe` : `Switch to ${plan.label}`}
              </button>
            )}
            {plan.id !== org.plan && plan.priceMonthlyUsd === 0 && (
              <button type="button" className="btn btn-ghost mt-3 w-full" disabled={!isOwner || upgradeBusy} onClick={() => switchPlan.mutate(plan.id)}>
                Downgrade to Free
              </button>
            )}
          </Card>
        ))}
      </div>

      <p className="muted text-[11.5px]">
        {billing.stripeConfigured
          ? 'Payments run through Stripe Checkout; plan changes are applied only by verified Stripe webhooks. Manage or cancel via the Stripe customer portal.'
          : 'Stripe is not configured on this deployment — dev-mode plan switching is enabled for evaluation. In production, checkout, upgrades, downgrades and cancellation run through Stripe with verified webhooks; the dashboard never sets plans from the client.'}
      </p>
    </div>
  );
}
