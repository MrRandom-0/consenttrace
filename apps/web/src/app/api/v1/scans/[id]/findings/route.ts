import { requireApiKey } from '@/server/apikeys';
import { sql } from '@/server/db';
import { handleError, HttpError, json } from '@/server/http';
import { getScanForOrg } from '@/server/scans';
import { v1RateLimit } from '@/server/v1';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const { id } = await params;
    const scan = await getScanForOrg(id, ctx.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    const findings = await sql`
      select rule_id, rule_version, severity, status, title, observation, expected_behavior,
             actual_behavior, evidence_ids, regression, first_detected_at, metadata
      from findings where scan_id = ${scan.id}
      order by case severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;
    return json({ data: findings });
  } catch (err) {
    return handleError(err);
  }
}
