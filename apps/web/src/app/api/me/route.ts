import { entitlementsFor, PLANS, usageFor } from '@/server/entitlements';
import { handleError, json, requireAuth } from '@/server/http';
import { isStripeConfigured } from '@/server/stripe';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    const usage = await usageFor(auth.org.id);
    return json({
      user: auth.user,
      org: { id: auth.org.id, name: auth.org.name, slug: auth.org.slug, plan: auth.org.plan, role: auth.org.role },
      entitlements: entitlementsFor(auth.org.plan),
      usage,
      billing: {
        stripeConfigured: isStripeConfigured(),
        devMode: process.env.CT_BILLING_DEV_MODE !== 'false' && process.env.NODE_ENV !== 'production',
      },
      plans: Object.values(PLANS).map((p) => ({ id: p.id, label: p.label, priceMonthlyUsd: p.priceMonthlyUsd, blurb: p.blurb, entitlements: p.entitlements })),
    });
  } catch (err) {
    return handleError(err);
  }
}
