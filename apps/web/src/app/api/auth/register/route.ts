import { z } from 'zod';
import { createSession, hashPassword, sessionCookie } from '@/server/auth';
import { sql } from '@/server/db';
import { assertSameOrigin, clientIp, handleError, HttpError, json, rateLimit, readJson } from '@/server/http';

const schema = z.object({
  email: z.string().email().max(254).transform((v) => v.toLowerCase().trim()),
  password: z.string().min(10).max(200),
  name: z.string().min(1).max(120),
  orgName: z.string().min(2).max(120),
});

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    rateLimit(`register:${clientIp(req)}`, 5, 60000);
    const body = await readJson(req, schema);

    const existing = await sql`select id from users where email = ${body.email}`;
    if (existing.length > 0) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');

    const passwordHash = await hashPassword(body.password);
    const slugBase = body.orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 7)}`;

    const userId = await sql.begin(async (tx) => {
      const [user] = await tx`insert into users (email, name, password_hash) values (${body.email}, ${body.name}, ${passwordHash}) returning id`;
      const [org] = await tx`insert into organizations (name, slug, plan) values (${body.orgName}, ${slug}, 'free') returning id`;
      await tx`insert into organization_members (organization_id, user_id, role) values (${org!['id']}, ${user!['id']}, 'owner')`;
      return user!['id'] as string;
    });

    const session = await createSession(userId);
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
