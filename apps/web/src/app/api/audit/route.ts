import { sql } from '@/server/db';
import { handleError, json, requireAuth } from '@/server/http';

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    const limit = Math.min(Number(new URL(req.url).searchParams.get('limit') ?? 50), 200);
    const events = await sql`
      select a.id, a.event, a.resource_type, a.resource_id, a.metadata, a.created_at, u.email as actor_email
      from audit_log a left join users u on u.id = a.actor_user_id
      where a.organization_id = ${auth.org.id}
      order by a.created_at desc limit ${limit}`;
    return json({ events });
  } catch (err) {
    return handleError(err);
  }
}
