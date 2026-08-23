import { z } from 'zod';
import { assertSameOrigin, handleError, HttpError, json, readJson, requireAuth, requireRole } from '@/server/http';
import { getScanForOrg, setBaseline } from '@/server/scans';

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ note: z.string().max(300).optional() });

export async function POST(req: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const { id } = await params;
    const body = await readJson(req, schema);
    const scan = await getScanForOrg(id, auth.org.id);
    if (!scan) throw new HttpError(404, 'NOT_FOUND', 'Scan not found.');
    await setBaseline({ orgId: auth.org.id, userId: auth.user.id, scan, note: body.note ?? null });
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
