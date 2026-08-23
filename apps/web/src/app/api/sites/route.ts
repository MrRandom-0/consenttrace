import { z } from 'zod';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { checkLimit, entitlementsFor, usageFor } from '@/server/entitlements';
import { assertSameOrigin, handleError, HttpError, json, readJson, requireAuth, requireRole } from '@/server/http';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    const sites = await sql`
      select s.id, s.name, s.primary_url, s.status, s.created_at, s.authorized_confirmed_at,
             se.id as environment_id, se.base_url,
             latest.id as latest_scan_id, latest.status as latest_scan_status, latest.completed_at as latest_scan_at, latest.summary as latest_summary
      from sites s
      join site_environments se on se.site_id = s.id and se.name = 'Production'
      left join lateral (
        select id, status, completed_at, summary from scans
        where site_environment_id = se.id order by created_at desc limit 1
      ) latest on true
      where s.organization_id = ${auth.org.id} and s.status <> 'archived'
      order by s.created_at desc`;
    return json({ sites });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  authorized: z.literal(true, { errorMap: () => ({ message: 'You must confirm you are authorized to test this website.' }) }),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const body = await readJson(req, createSchema);

    const url = new URL(body.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new HttpError(400, 'INVALID_TARGET_URL', 'Only http(s) URLs can be monitored.');
    }
    const usage = await usageFor(auth.org.id);
    const limit = checkLimit(usage.sites, entitlementsFor(auth.org.plan).maxSites, 'sites');
    if (!limit.ok) throw new HttpError(402, 'PLAN_LIMIT', limit.message!);

    const { newVerificationToken } = await import('@/server/verification');
    const site = await sql.begin(async (tx) => {
      const [row] = await tx`insert into sites (organization_id, name, primary_url, status, authorized_confirmed_at, verification_token)
        values (${auth.org.id}, ${body.name}, ${body.url}, 'active', now(), ${newVerificationToken()}) returning id, name, primary_url`;
      await tx`insert into site_environments (site_id, name, base_url) values (${row!['id']}, 'Production', ${body.url})`;
      return row!;
    });
    await audit(auth.org.id, auth.user.id, 'site_created', 'site', site['id'] as string, { url: body.url });
    return json({ site }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
