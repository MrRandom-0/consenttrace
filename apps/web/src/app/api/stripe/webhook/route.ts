/**
 * Stripe webhook receiver — the ONLY production write path for plans.
 * Raw-body signature verification (manual HMAC, timing-safe) + event-id
 * idempotency. Unsigned/invalid requests are rejected before any parsing side
 * effects. No session auth: Stripe is the caller.
 */
import { handleError, HttpError, json } from '@/server/http';
import { handleStripeEvent, verifyStripeSignature } from '@/server/stripe';

export async function POST(req: Request): Promise<Response> {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(501, 'BILLING_NOT_CONFIGURED', 'Stripe webhooks are not configured.');
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!verifyStripeSignature(payload, signature, secret)) {
      throw new HttpError(400, 'BAD_SIGNATURE', 'Webhook signature verification failed.');
    }
    const event = JSON.parse(payload) as { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
    if (!event.id || !event.type || !event.data?.object) {
      throw new HttpError(400, 'INVALID_EVENT', 'Malformed event payload.');
    }
    const outcome = await handleStripeEvent({ id: event.id, type: event.type, data: { object: event.data.object } });
    return json({ received: true, ...outcome });
  } catch (err) {
    return handleError(err);
  }
}
