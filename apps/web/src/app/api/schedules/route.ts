import { z } from 'zod';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { entitlementsFor } from '@/server/entitlements';
import { assertSameOrigin, handleError, HttpError, json, readJson, requireAuth, requireRole } from '@/server/http';
import { nextRun, parseCron } from '@/server/schedules';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    const schedules = await sql`
      select sch.*, s.name as site_name, se.base_url
      from scan_schedules sch
      join site_environments se on se.id = sch.site_environment_id
      join sites s on s.id = se.site_id
      where sch.organization_id = ${auth.org.id}
      order by sch.created_at desc`;
    return json({ schedules });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  siteEnvironmentId: z.string().uuid(),
  cron: z.string().min(9).max(30),
  scenarios: z.array(z.enum(['no_action', 'accept_all', 'reject_all'])).min(1).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    if (!entitlementsFor(auth.org.plan).scheduledScans) {
      throw new HttpError(402, 'PLAN_LIMIT', 'Scheduled scanning requires the Pro plan or above.');
    }
    const body = await readJson(req, createSchema);
    if (!parseCron(body.cron)) {
      throw new HttpError(400, 'INVALID_CRON', 'Supported formats: "M H * * *" (daily) or "M H * * D" (weekly, D=0-6).');
    }
    const envRows = await sql`
      select se.id from site_environments se join sites s on s.id = se.site_id
      where se.id = ${body.siteEnvironmentId} and s.organization_id = ${auth.org.id}`;
    if (envRows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Site environment not found.');

    const next = nextRun(body.cron);
    const scenarios = body.scenarios ?? ['no_action', 'reject_all', 'accept_all'];
    const [schedule] = await sql`
      insert into scan_schedules (organization_id, site_environment_id, cron, timezone, scenarios, enabled, next_run_at)
      values (${auth.org.id}, ${body.siteEnvironmentId}, ${body.cron}, 'server', ${sql.json(scenarios)}, true, ${next})
      returning *`;
    await audit(auth.org.id, auth.user.id, 'schedule_created', 'schedule', schedule!['id'] as string, { cron: body.cron });
    return json({ schedule }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
