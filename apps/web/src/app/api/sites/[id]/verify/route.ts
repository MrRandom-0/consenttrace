import { z } from 'zod';
import { assertSameOrigin, clientIp, handleError, json, rateLimit, readJson, requireAuth, requireRole } from '@/server/http';
import { verifySiteDomain } from '@/server/verification';

type Params = { params: Promise<{ id: string }> };
const schema = z.object({ method: z.enum(['dns_txt', 'html_meta', 'file']) });

export async function POST(req: Request, { params }: Params): Promise<Response> {
  try {
    assertSameOrigin(req);
    const auth = await requireAuth();
    requireRole(auth, 'admin');
    rateLimit(`verify:${auth.org.id}:${clientIp(req)}`, 10, 60000);
    const { id } = await params;
    const body = await readJson(req, schema);
    const result = await verifySiteDomain({ siteId: id, orgId: auth.org.id, userId: auth.user.id, method: body.method });
    return json(result);
  } catch (err) {
    return handleError(err);
  }
}
