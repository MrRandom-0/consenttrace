import { requireApiKey } from '@/server/apikeys';
import { handleError, HttpError } from '@/server/http';
import { getScanForOrg } from '@/server/scans';
import { resolveArtifact, streamArtifact } from '@/server/storage';
import { v1RateLimit } from '@/server/v1';

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const { id } = await params;
    const scan = await getScanForOrg(id, ctx.org.id);
    if (!scan?.report_artifact_path) throw new HttpError(404, 'NOT_FOUND', 'Report not available for this scan.');
    const absolute = resolveArtifact(scan.id, scan.report_artifact_path);
    if (!absolute) throw new HttpError(404, 'NOT_FOUND', 'Report artifact missing.');
    return await streamArtifact(absolute);
  } catch (err) {
    return handleError(err);
  }
}
