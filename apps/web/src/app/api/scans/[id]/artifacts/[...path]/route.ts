/**
 * Evidence artifact reads: authorization check (org owns the scan) then stream.
 * Mirrors the production signed-URL model where URLs are minted post-authz.
 */
import { handleError, HttpError, requireAuth } from '@/server/http';
import { getScanForOrg } from '@/server/scans';
import { resolveArtifact, streamArtifact } from '@/server/storage';

type Params = { params: Promise<{ id: string; path: string[] }> };

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  try {
    const auth = await requireAuth();
    const { id, path } = await params;
    const scan = await getScanForOrg(id, auth.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    const relPath = path.join('/');
    const absolute = resolveArtifact(scan.id, relPath);
    if (!absolute) throw new HttpError(404, 'NOT_FOUND', 'Artifact not found.');
    return await streamArtifact(absolute);
  } catch (err) {
    return handleError(err);
  }
}
