/**
 * DEV-MODE plan switch. In production this endpoint does not exist: plans are
 * updated exclusively by verified Stripe webhooks (docs/BILLING.md), never from
 * frontend-supplied values. Gated by CT_BILLING_DEV_MODE.
 */
import { z } from 'zod';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { PLANS } from '@/server/entitlements';
import { assertSameOrigin, handleError, HttpError, json, readJson, requireAuth, requireRole } from '@/server/http';

const schema = z.object({ plan: z.enum(['free', 'pro', 'agency', 'scale']) });

export async function POST(req: Request): Promise<Response> {
  try {
    if (process.env.CT_BILLING_DEV_MODE === 'false' || process.env.NODE_ENV === 'production') {
      throw new HttpError(403, 'BILLING_LOCKED', 'Plan changes are handled by Stripe in production.');
    }
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'owner');
    const body = await readJson(req, schema);
    if (!PLANS[body.plan]) throw new HttpError(400, 'INVALID_PLAN', 'Unknown plan.');
    await sql`update organizations set plan = ${body.plan}, updated_at = now() where id = ${auth.org.id}`;
    await audit(auth.org.id, auth.user.id, 'subscription_changed', 'organization', auth.org.id, { plan: body.plan, mode: 'dev' });
    return json({ ok: true, plan: body.plan });
  } catch (err) {
    return handleError(err);
  }
}
