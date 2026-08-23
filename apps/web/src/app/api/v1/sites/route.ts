import { z } from 'zod';
import { requireApiKey } from '@/server/apikeys';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { checkLimit, entitlementsFor, usageFor } from '@/server/entitlements';
import { handleError, HttpError, json, readJson } from '@/server/http';
import { newVerificationToken } from '@/server/verification';
import { v1RateLimit } from '@/server/v1';

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const sites = await sql`
      select s.id, s.name, s.primary_url as url, s.status, s.verified_at is not null as verified,
             se.id as environment_id, s.created_at
      from sites s join site_environments se on se.site_id = s.id and se.name = 'Production'
      where s.organization_id = ${ctx.org.id} and s.status <> 'archived'
      order by s.created_at desc`;
    return json({ data: sites });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  /** Explicit authorization confirmation — same obligation as the dashboard checkbox. */
  authorized: z.literal(true, { errorMap: () => ({ message: 'Set "authorized": true to confirm you may test this website.' }) }),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'write');
    v1RateLimit(ctx);
    const body = await readJson(req, createSchema);
    const url = new URL(body.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new HttpError(400, 'INVALID_TARGET_URL', 'Only http(s) URLs can be monitored.');
    }
    const usage = await usageFor(ctx.org.id);
    const limit = checkLimit(usage.sites, entitlementsFor(ctx.org.plan).maxSites, 'sites');
    if (!limit.ok) throw new HttpError(402, 'PLAN_LIMIT', limit.message!);

    const site = await sql.begin(async (tx) => {
      const [row] = await tx`insert into sites (organization_id, name, primary_url, status, authorized_confirmed_at, verification_token)
        values (${ctx.org.id}, ${body.name}, ${body.url}, 'active', now(), ${newVerificationToken()})
        returning id, name, primary_url as url`;
      const [env] = await tx`insert into site_environments (site_id, name, base_url) values (${row!['id']}, 'Production', ${body.url}) returning id`;
      return {
        id: row!['id'] as string,
        name: row!['name'] as string,
        url: row!['url'] as string,
        environment_id: env!['id'] as string,
      };
    });
    await audit(ctx.org.id, null, 'site_created', 'site', site['id'] as string, { url: body.url, via: 'api', keyId: ctx.keyId });
    return json({ data: site }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
