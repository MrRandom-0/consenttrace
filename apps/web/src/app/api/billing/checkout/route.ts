import { z } from 'zod';
import { assertSameOrigin, handleError, json, readJson, requireAuth, requireRole } from '@/server/http';
import { createCheckoutSession } from '@/server/stripe';

const schema = z.object({ plan: z.enum(['pro', 'agency']) });

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'owner');
    const body = await readJson(req, schema);
    const base = process.env.APP_BASE_URL ?? new URL(req.url).origin;
    const session = await createCheckoutSession({
      orgId: auth.org.id,
      plan: body.plan,
      successUrl: `${base}/app/billing?checkout=success`,
      cancelUrl: `${base}/app/billing?checkout=canceled`,
    });
    return json({ url: session.url });
  } catch (err) {
    return handleError(err);
  }
}
