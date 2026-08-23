import { z } from 'zod';
import { createSession, sessionCookie, verifyPassword } from '@/server/auth';
import { sql, type UserRow } from '@/server/db';
import { assertSameOrigin, clientIp, handleError, HttpError, json, rateLimit, readJson } from '@/server/http';

const schema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1).max(200),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    rateLimit(`login:${clientIp(req)}`, 10, 60000);
    const body = await readJson(req, schema);
    const rows = await sql<UserRow[]>`select id, email, name, password_hash from users where email = ${body.email}`;
    const user = rows[0];
    if (!user?.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
    }
    const session = await createSession(user.id);
    const res = json({ ok: true });
    const cookie = sessionCookie(session.token, session.expiresAt);
    res.headers.append(
      'set-cookie',
      `${cookie.name}=${cookie.value}; Path=${cookie.path}; Expires=${cookie.expires.toUTCString()}; HttpOnly; SameSite=Lax${cookie.secure ? '; Secure' : ''}`,
    );
    return res;
  } catch (err) {
    return handleError(err);
  }
}
