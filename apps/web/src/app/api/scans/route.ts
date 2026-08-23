import { z } from 'zod';
import { sql } from '@/server/db';
import { assertSameOrigin, handleError, json, readJson, requireAuth, requireRole } from '@/server/http';
import { createScan } from '@/server/scans';

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100);
    const scans = await sql`
      select sc.id, sc.status, sc.trigger_type, sc.created_at, sc.started_at, sc.completed_at, sc.summary,
             sc.error_code, sc.baseline_scan_id, s.name as site_name, s.id as site_id, se.base_url
      from scans sc
      join site_environments se on se.id = sc.site_environment_id
      join sites s on s.id = se.site_id
      where sc.organization_id = ${auth.org.id}
      order by sc.created_at desc
      limit ${limit}`;
    return json({ scans });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  siteEnvironmentId: z.string().uuid(),
  scenarios: z
    .array(z.enum(['no_action', 'accept_all', 'reject_all', 'essential_only', 'custom_preferences', 'withdraw_consent']))
    .min(1)
    .optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'analyst');
    const body = await readJson(req, createSchema);
    const scan = await createScan({
      orgId: auth.org.id,
      orgPlan: auth.org.plan,
      userId: auth.user.id,
      siteEnvironmentId: body.siteEnvironmentId,
      ...(body.scenarios ? { scenarios: body.scenarios } : {}),
    });
    return json({ scan: { id: scan.id, status: scan.status } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
