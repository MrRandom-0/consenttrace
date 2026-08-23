/**
 * Data-driven plans and entitlements (spec §75–76). The backend is the source
 * of truth — the frontend renders these values and never asserts plan state.
 * Stripe (Phase 3) updates organizations.plan via verified webhooks only.
 */
import { sql } from './db';

export interface Entitlements {
  maxSites: number;
  maxMonthlyScans: number;
  scheduledScans: boolean;
  aiAnalysis: boolean;
  brandedReports: boolean;
  apiAccess: boolean;
  evidenceRetentionDays: number;
  maxMembers: number;
}

export interface PlanDefinition {
  id: string;
  label: string;
  priceMonthlyUsd: number | null; // null = custom
  blurb: string;
  entitlements: Entitlements;
}

export const PLANS: Record<string, PlanDefinition> = {
  free: {
    id: 'free',
    label: 'Free',
    priceMonthlyUsd: 0,
    blurb: 'Kick the tires on one site.',
    entitlements: {
      maxSites: 1,
      maxMonthlyScans: 20,
      scheduledScans: false,
      aiAnalysis: false,
      brandedReports: false,
      apiAccess: false,
      evidenceRetentionDays: 7,
      maxMembers: 1,
    },
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceMonthlyUsd: 29,
    blurb: 'Scheduled consent monitoring for a small portfolio.',
    entitlements: {
      maxSites: 5,
      maxMonthlyScans: 300,
      scheduledScans: true,
      aiAnalysis: true,
      brandedReports: false,
      apiAccess: false,
      evidenceRetentionDays: 90,
      maxMembers: 3,
    },
  },
  agency: {
    id: 'agency',
    label: 'Agency',
    priceMonthlyUsd: 89,
    blurb: 'Client portfolios, branded evidence, teams.',
    entitlements: {
      maxSites: 30,
      maxMonthlyScans: 2000,
      scheduledScans: true,
      aiAnalysis: true,
      brandedReports: true,
      apiAccess: true,
      evidenceRetentionDays: 365,
      maxMembers: 10,
    },
  },
  scale: {
    id: 'scale',
    label: 'Scale',
    priceMonthlyUsd: null,
    blurb: 'Consultancies and platforms. Custom limits.',
    entitlements: {
      maxSites: 1000,
      maxMonthlyScans: 100000,
      scheduledScans: true,
      aiAnalysis: true,
      brandedReports: true,
      apiAccess: true,
      evidenceRetentionDays: 730,
      maxMembers: 100,
    },
  },
};

export function entitlementsFor(plan: string): Entitlements {
  return (PLANS[plan] ?? PLANS['free']!).entitlements;
}

export interface Usage {
  sites: number;
  scansThisMonth: number;
  members: number;
}

export async function usageFor(orgId: string): Promise<Usage> {
  const [sites] = await sql`select count(*)::int as n from sites where organization_id = ${orgId} and status <> 'archived'`;
  const [scans] = await sql`select count(*)::int as n from scans where organization_id = ${orgId} and created_at >= date_trunc('month', now())`;
  const [members] = await sql`select count(*)::int as n from organization_members where organization_id = ${orgId}`;
  return { sites: sites?.['n'] ?? 0, scansThisMonth: scans?.['n'] ?? 0, members: members?.['n'] ?? 0 };
}

export function checkLimit(current: number, max: number, noun: string): { ok: boolean; message?: string } {
  if (current >= max) {
    return { ok: false, message: `Plan limit reached: ${max} ${noun}. Upgrade to continue.` };
  }
  return { ok: true };
}
