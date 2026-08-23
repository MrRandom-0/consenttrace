import { z } from 'zod';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';
import { assertSameOrigin, handleError, HttpError, json, readJson, requireAuth, requireRole } from '@/server/http';

type Params = { params: Promise<{ id: string }> };
const patchSchema = z.object({ enabled: z.boolean() });

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const { id } = await params;
    const body = await readJson(req, patchSchema);
    const rows = await sql`update scan_schedules set enabled = ${body.enabled}
      where id = ${id} and organization_id = ${auth.org.id} returning id`;
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');
    await audit(auth.org.id, auth.user.id, 'schedule_updated', 'schedule', id, { enabled: body.enabled });
    return json({ ok: true });
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
    const rows = await sql`delete from scan_schedules where id = ${id} and organization_id = ${auth.org.id} returning id`;
    if (rows.length === 0) throw new HttpError(404, 'NOT_FOUND', 'Schedule not found.');
    await audit(auth.org.id, auth.user.id, 'schedule_deleted', 'schedule', id, {});
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
