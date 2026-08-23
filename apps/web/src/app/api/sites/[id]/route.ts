import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { assertSameOrigin, handleError, HttpError, json, requireAuth, requireRole } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const rows = await sql`
      select s.*, se.id as environment_id, se.base_url, se.default_locale
      from sites s join site_environments se on se.site_id = s.id and se.name = 'Production'
      where s.id = ${id} and s.organization_id = ${auth.org.id}`;
    const site = rows[0];
    if (!site) throw new HttpError(404, 'NOT_FOUND', 'Site not found.');

    const scans = await sql`
      select id, status, trigger_type, created_at, started_at, completed_at, summary, error_code, baseline_scan_id
      from scans where site_environment_id = ${site['environment_id']}
      order by created_at desc limit 25`;
    const baselines = await sql`
      select b.*, sc.completed_at as scan_completed_at
      from baselines b join scans sc on sc.id = b.scan_id
      where b.site_environment_id = ${site['environment_id']} and b.superseded_at is null
      order by b.created_at desc limit 1`;
    const schedules = await sql`
      select * from scan_schedules where site_environment_id = ${site['environment_id']} order by created_at desc`;
    const openFindings = await sql`
      select f.rule_id, f.severity, f.title, f.observation, f.regression, f.scan_id, f.first_detected_at
      from findings f join scans sc on sc.id = f.scan_id
      where sc.site_environment_id = ${site['environment_id']} and f.status = 'open'
      order by f.first_detected_at desc limit 20`;
    return json({ site, scans, baseline: baselines[0] ?? null, schedules, openFindings });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(req: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const { id } = await params;
    const rows = await sql`update sites set status = 'archived', updated_at = now()
      where id = ${id} and organization_id = ${auth.org.id} returning id, name`;
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Site not found.');
    await audit(auth.org.id, auth.user.id, 'site_deleted', 'site', id, {});
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
