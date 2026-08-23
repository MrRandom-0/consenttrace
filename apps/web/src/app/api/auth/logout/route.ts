import { cookies } from 'next/headers';
import { destroySession, SESSION_COOKIE_NAME } from '@/server/auth';
import { assertSameOrigin, handleError, json } from '@/server/http';

export async function POST(req: Request): Promise<Response> {
  try {
    assertSameOrigin(req);
    const store = await cookies();
    const token = store.get(SESSION_COOKIE_NAME)?.value;
    if (token) await destroySession(token);
    const res = json({ ok: true });
    res.headers.append('set-cookie', `${SESSION_COOKIE_NAME}=; Path=/; Expires=${new Date(0).toUTCString()}; HttpOnly; SameSite=Lax`);
    return res;
  } catch (err) {
    return handleError(err);
  }
}
