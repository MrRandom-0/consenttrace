/**
 * Notification adapter (spec §70). Drivers:
 * - "log" (default): structured console output — dev/self-hosted without email.
 * - "resend": production driver via Resend REST API; requires EMAIL_PROVIDER_API_KEY
 *   and EMAIL_FROM_ADDRESS. Marked not-configured (falls back to log) without them.
 * Policy: alert on failures and on scans with findings (regressions emphasized);
 * unchanged successful scans stay quiet.
 */
import { sql, type ScanRow, type ScanSummaryJson } from './db';

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}
export type SendEmail = (message: EmailMessage) => Promise<void>;

const logDriver: SendEmail = async (message) => {
  console.log(`[notify] (log driver) to=${message.to.join(',')} subject="${message.subject}"`);
};

const resendDriver: SendEmail = async (message) => {
  const key = process.env.EMAIL_PROVIDER_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!key || !from) return logDriver(message);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: message.to, subject: message.subject, text: message.text }),
  });
  if (!res.ok) throw new Error(`resend_failed_${res.status}`);
};

export function currentDriver(): SendEmail {
  return process.env.EMAIL_PROVIDER === 'resend' ? resendDriver : logDriver;
}

async function recipientsFor(orgId: string): Promise<string[]> {
  const members = await sql`
    select u.email from organization_members m join users u on u.id = m.user_id
    where m.organization_id = ${orgId} and m.role in ('owner', 'admin')`;
  const destinations = await sql`
    select target from notification_destinations
    where organization_id = ${orgId} and kind = 'email' and enabled = true`;
  return [...new Set([...members.map((r) => r['email'] as string), ...destinations.map((r) => r['target'] as string)])];
}

/** Fire-and-forget from the runner: never throws into the scan loop. */
export async function notifyScanOutcome(
  scan: ScanRow,
  siteName: string,
  summary: ScanSummaryJson | null,
  send: SendEmail = currentDriver(),
): Promise<boolean> {
  try {
    const failed = scan.status === 'failed';
    const findings = summary?.findingCount ?? 0;
    const regressions = summary?.regressionCount ?? 0;
    if (!failed && findings === 0) return false; // quiet on healthy scans

    const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
    const subject = failed
      ? `[ConsentTrace] Scan failed — ${siteName}`
      : regressions > 0
        ? `[ConsentTrace] REGRESSION — ${siteName}: ${regressions} regression(s), ${findings} finding(s)`
        : `[ConsentTrace] ${findings} consent finding(s) — ${siteName}`;
    const text = [
      failed
        ? `The scheduled/manual scan for ${siteName} failed (${scan.error_code ?? 'unknown error'}).`
        : `ConsentTrace observed ${findings} finding(s)${regressions > 0 ? ` including ${regressions} regression(s) against your baseline` : ''} on ${siteName}.`,
      '',
      `Evidence: ${base}/app/scans/${scan.id}`,
      '',
      'ConsentTrace provides automated technical observations about website consent behavior. It does not provide legal advice.',
    ].join('\n');

    const to = await recipientsFor(scan.organization_id);
    if (to.length === 0) return false;
    await send({ to, subject, text });
    return true;
  } catch (err) {
    console.error('[notify] failed', err);
    return false;
  }
}
