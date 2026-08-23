import { z } from 'zod';
import { requireApiKey } from '@/server/apikeys';
import { handleError, HttpError, json, readJson } from '@/server/http';
import { getScanForOrg, setBaseline } from '@/server/scans';
import { v1RateLimit } from '@/server/v1';

const schema = z.object({
  scanId: z.string().uuid(),
  note: z.string().max(300).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'write');
    v1RateLimit(ctx);
    const body = await readJson(req, schema);
    const scan = await getScanForOrg(body.scanId, ctx.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    await setBaseline({ orgId: ctx.org.id, userId: null, scan, note: body.note ?? null });
    return json({ data: { baselineScanId: scan.id } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
