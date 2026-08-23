/**
 * Stripe billing (spec §77). No SDK — a thin, auditable REST layer:
 * - createCheckoutSession: form-encoded POST to /v1/checkout/sessions.
 * - verifyStripeSignature: manual HMAC-SHA256 of `${t}.${payload}` against the
 *   webhook secret with timestamp tolerance and timing-safe comparison.
 * - handleStripeEvent: idempotent (stripe_events table) plan/state updates.
 * Plans NEVER change from frontend values in production — webhooks only.
 * Not configured (missing envs) → billing endpoints report BILLING_NOT_CONFIGURED.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { audit } from './audit';
import { sql } from './db';
import { PLANS } from './entitlements';
import { HttpError } from './http';

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function priceIdFor(plan: string): string | null {
  const map: Record<string, string | undefined> = {
    pro: process.env.STRIPE_PRICE_PRO,
    agency: process.env.STRIPE_PRICE_AGENCY,
  };
  return map[plan] ?? null;
}

export async function createCheckoutSession(opts: {
  orgId: string;
  plan: 'pro' | 'agency';
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  const secret = process.env.STRIPE_SECRET_KEY;
  const price = priceIdFor(opts.plan);
  if (!secret || !price) {
    throw new HttpError(501, 'BILLING_NOT_CONFIGURED', 'Stripe is not configured on this deployment.');
  }
  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': price,
    'line_items[0][quantity]': '1',
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    client_reference_id: opts.orgId,
    'metadata[org_id]': opts.orgId,
    'metadata[plan]': opts.plan,
    'subscription_data[metadata][org_id]': opts.orgId,
    'subscription_data[metadata][plan]': opts.plan,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as { url?: string; error?: { message?: string } };
  if (!res.ok || !data.url) {
    throw new HttpError(502, 'STRIPE_ERROR', data.error?.message ?? 'Stripe checkout session failed.');
  }
  return { url: data.url };
}

/** Verify a Stripe-Signature header. Exported for tests. */
export function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader) return false;
  const parts = new Map<string, string[]>();
  for (const piece of signatureHeader.split(',')) {
    const [key, value] = piece.split('=', 2);
    if (!key || value === undefined) continue;
    const list = parts.get(key) ?? [];
    list.push(value);
    parts.set(key, list);
  }
  const timestamp = Number(parts.get('t')?.[0]);
  const signatures = parts.get('v1') ?? [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return signatures.some((sig) => {
    const buf = Buffer.from(sig, 'utf8');
    return buf.length === expectedBuf.length && timingSafeEqual(buf, expectedBuf);
  });
}

interface StripeEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

/** Idempotently apply a verified Stripe event. Returns what happened (for logs/tests). */
export async function handleStripeEvent(event: StripeEvent): Promise<{ applied: boolean; duplicate: boolean }> {
  const inserted = await sql`insert into stripe_events (id, type) values (${event.id}, ${event.type}) on conflict (id) do nothing returning id`;
  if (inserted.length === 0) return { applied: false, duplicate: true };

  const object = event.data.object;
  switch (event.type) {
    case 'checkout.session.completed': {
      const orgId = (object['client_reference_id'] as string) ?? (object['metadata'] as Record<string, string>)?.['org_id'];
      const plan = (object['metadata'] as Record<string, string>)?.['plan'];
      if (!orgId || !plan || !PLANS[plan]) return { applied: false, duplicate: false };
      await sql`update organizations set plan = ${plan}, subscription_status = 'active',
        stripe_customer_id = ${(object['customer'] as string) ?? null},
        stripe_subscription_id = ${(object['subscription'] as string) ?? null},
        updated_at = now() where id = ${orgId}`;
      await audit(orgId, null, 'subscription_changed', 'organization', orgId, { plan, source: 'stripe_checkout' });
      return { applied: true, duplicate: false };
    }
    case 'customer.subscription.updated': {
      const subId = object['id'] as string;
      const stripeStatus = object['status'] as string;
      const status = stripeStatus === 'active' || stripeStatus === 'trialing' ? 'active' : stripeStatus === 'past_due' || stripeStatus === 'unpaid' ? 'past_due' : 'canceled';
      await sql`update organizations set subscription_status = ${status}, updated_at = now() where stripe_subscription_id = ${subId}`;
      return { applied: true, duplicate: false };
    }
    case 'customer.subscription.deleted': {
      const subId = object['id'] as string;
      const rows = await sql`update organizations set plan = 'free', subscription_status = 'canceled', updated_at = now()
        where stripe_subscription_id = ${subId} returning id`;
      for (const row of rows) {
        await audit(row['id'] as string, null, 'subscription_changed', 'organization', row['id'] as string, { plan: 'free', source: 'stripe_subscription_deleted' });
      }
      return { applied: true, duplicate: false };
    }
    case 'invoice.payment_failed': {
      const customer = object['customer'] as string;
      await sql`update organizations set subscription_status = 'past_due', updated_at = now() where stripe_customer_id = ${customer}`;
      return { applied: true, duplicate: false };
    }
    default:
      return { applied: false, duplicate: false };
  }
}
