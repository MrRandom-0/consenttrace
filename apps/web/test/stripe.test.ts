import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyStripeSignature } from '../src/server/stripe';

const SECRET = 'whsec_test_secret';
const sign = (payload: string, timestamp: number) =>
  `t=${timestamp},v1=${createHmac('sha256', SECRET).update(`${timestamp}.${payload}`).digest('hex')}`;

describe('verifyStripeSignature', () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const now = 1_700_000_000;

  it('accepts a valid signature within tolerance', () => {
    expect(verifyStripeSignature(payload, sign(payload, now - 60), SECRET, 300, now)).toBe(true);
  });
  it('rejects a tampered payload', () => {
    expect(verifyStripeSignature(payload + 'x', sign(payload, now), SECRET, 300, now)).toBe(false);
  });
  it('rejects the wrong secret', () => {
    const header = `t=${now},v1=${createHmac('sha256', 'other').update(`${now}.${payload}`).digest('hex')}`;
    expect(verifyStripeSignature(payload, header, SECRET, 300, now)).toBe(false);
  });
  it('rejects stale timestamps (replay defense)', () => {
    expect(verifyStripeSignature(payload, sign(payload, now - 3600), SECRET, 300, now)).toBe(false);
  });
  it('rejects missing/malformed headers', () => {
    expect(verifyStripeSignature(payload, null, SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(payload, 'v1=abc', SECRET, 300, now)).toBe(false);
    expect(verifyStripeSignature(payload, `t=${now}`, SECRET, 300, now)).toBe(false);
  });
  it('accepts when any v1 signature matches (key rotation)', () => {
    const good = sign(payload, now);
    const header = `${good},v1=deadbeef`;
    expect(verifyStripeSignature(payload, header, SECRET, 300, now)).toBe(true);
  });
});
