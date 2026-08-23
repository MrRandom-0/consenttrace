import { sql } from '@/server/db';
import { handleError, HttpError, json, requireAuth } from '@/server/http';
import { getScanForOrg, loadScanResult } from '@/server/scans';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const auth = await requireAuth();
    const { id } = await params;
    const scan = await getScanForOrg(id, auth.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');

    const siteRows = await sql`
      select s.id as site_id, s.name as site_name, se.base_url
      from site_environments se join sites s on s.id = se.site_id
      where se.id = ${scan.site_environment_id}`;

    const includeResult = new URL(req.url).searchParams.get('include') === 'result';
    const result = includeResult && scan.result_artifact_path ? await loadScanResult(scan) : null;

    const baselineRows = await sql`
      select b.scan_id, b.note, b.created_at from baselines b
      where b.site_environment_id = ${scan.site_environment_id} and b.superseded_at is null limit 1`;
    const isBaseline = baselineRows[0]?.['scan_id'] === scan.id;

    return json({ scan, site: siteRows[0] ?? null, result, isBaseline, activeBaseline: baselineRows[0] ?? null });
  } catch (err) {
    return handleError(err);
  }
}
