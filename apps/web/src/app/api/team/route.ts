import { sql } from '@/server/db';
import { handleError, json, requireAuth } from '@/server/http';

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    const members = await sql`
      select u.id, u.email, u.name, m.role, m.joined_at
      from organization_members m join users u on u.id = m.user_id
      where m.organization_id = ${auth.org.id}
      order by m.joined_at asc`;
    return json({ members });
  } catch (err) {
    return handleError(err);
  }
}
