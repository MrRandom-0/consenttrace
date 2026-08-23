import { revokeApiKey } from '@/server/apikeys';
import { audit } from '@/server/audit';
import { assertSameOrigin, handleError, HttpError, json, requireAuth, requireRole } from '@/server/http';

type Params = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const { id } = await params;
    const revoked = await revokeApiKey(auth.org.id, id);
    if (!revoked) throw new HttpError(404, 'NOT_FOUND', 'API key not found or already revoked.');
    await audit(auth.org.id, auth.user.id, 'api_key_revoked', 'api_key', id, {});
    return json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
