import { requireApiKey } from '@/server/apikeys';
import { sql } from '@/server/db';
import { handleError, HttpError, json } from '@/server/http';
import { getScanForOrg } from '@/server/scans';
import { v1RateLimit } from '@/server/v1';

type Params = { params: Promise<{ id: string }> };

/** Evidence index: artifact metadata + hashes. Bytes are fetched per-artifact via the report/artifact endpoints. */
export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const { id } = await params;
    const scan = await getScanForOrg(id, ctx.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    const artifacts = await sql`
      select type, label, artifact_path, sha256, bytes, created_at
      from evidence_items where scan_id = ${scan.id} order by artifact_path`;
    return json({
      data: {
        scanId: scan.id,
        artifacts,
        note: 'Artifact hashes are tamper-evident. Fetch report.html via /v1/scans/:id/report.',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
