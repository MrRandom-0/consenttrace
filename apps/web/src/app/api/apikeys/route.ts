import { z } from 'zod';
import { createApiKey, listApiKeys } from '@/server/apikeys';
import { audit } from '@/server/audit';
import { assertSameOrigin, handleError, json, readJson, requireAuth, requireRole } from '@/server/http';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    return json({ keys: await listApiKeys(auth.org.id) });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  scope: z.enum(['read', 'write']).optional(),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    const body = await readJson(req, createSchema);
    const scope = body.scope ?? 'write';
    const { key, token } = await createApiKey({
      orgId: auth.org.id,
      userId: auth.user.id,
      name: body.name,
      scope,
      plan: auth.org.plan,
    });
    await audit(auth.org.id, auth.user.id, 'api_key_created', 'api_key', key.id, { name: body.name, scope });
    // The plaintext token appears exactly once, in this response.
    return json({ key, token }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
