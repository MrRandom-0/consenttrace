import { z } from 'zod';
import { requireApiKey } from '@/server/apikeys';
import { sql } from '@/server/db';
import { handleError, HttpError, json, readJson } from '@/server/http';
import { createScan } from '@/server/scans';
import { decodeCursor, encodeCursor, v1RateLimit } from '@/server/v1';

export async function GET(req: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'read');
    v1RateLimit(ctx);
    const url = new URL(req.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 25), 1), 100);
    const siteId = url.searchParams.get('siteId');
    const cursor = decodeCursor(url.searchParams.get('cursor'));

    const rows = await sql`
      select sc.id, sc.status, sc.trigger_type, sc.created_at, sc.created_at::text as cursor_ts,
             sc.started_at, sc.completed_at,
             sc.error_code, sc.baseline_scan_id, sc.summary, s.id as site_id, se.id as environment_id
      from scans sc
      join site_environments se on se.id = sc.site_environment_id
      join sites s on s.id = se.site_id
      where sc.organization_id = ${ctx.org.id}
        ${siteId ? sql`and s.id = ${siteId}` : sql``}
        ${cursor ? sql`and (sc.created_at, sc.id) < (${cursor.createdAt}::timestamptz, ${cursor.id}::uuid)` : sql``}
      order by sc.created_at desc, sc.id desc
      limit ${limit + 1}`;

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map(({ cursor_ts: _cursorTs, ...rest }) => rest);
    const last = rows[Math.min(limit, rows.length) - 1];
    return json({
      data,
      pagination: {
        hasMore,
        nextCursor: hasMore && last ? encodeCursor({ createdAt: last['cursor_ts'] as string, id: last['id'] as string }) : null,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

const createSchema = z.object({
  siteEnvironmentId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  scenarios: z
    .array(z.enum(['no_action', 'accept_all', 'reject_all', 'essential_only', 'custom_preferences', 'withdraw_consent']))
    .min(1)
    .optional(),
}).refine((v) => v.siteEnvironmentId || v.siteId, { message: 'Provide siteEnvironmentId or siteId.' });

export async function POST(req: Request): Promise<Response> {
  try {
    const ctx = await requireApiKey(req, 'write');
    v1RateLimit(ctx);
    const idempotencyKey = req.headers.get('idempotency-key');
    if (idempotencyKey && idempotencyKey.length > 200) {
      throw new HttpError(400, 'VALIDATION', 'Idempotency-Key must be at most 200 characters.');
    }
    if (idempotencyKey) {
      const existing = await sql`
        select sc.id, sc.status, sc.created_at from idempotency_keys ik
        join scans sc on sc.id = ik.scan_id
        where ik.organization_id = ${ctx.org.id} and ik.key = ${idempotencyKey}`;
      if (existing[0]) {
        return json({ data: existing[0], idempotentReplay: true });
      }
    }

    const body = await readJson(req, createSchema);
    let environmentId = body.siteEnvironmentId ?? null;
    if (!environmentId && body.siteId) {
      const envRows = await sql`
        select se.id from site_environments se join sites s on s.id = se.site_id
        where s.id = ${body.siteId} and s.organization_id = ${ctx.org.id} and se.name = 'Production'`;
      environmentId = (envRows[0]?.['id'] as string) ?? null;
      if (!environmentId) throw new HttpError(404, 'NOT_FOUND', 'Site not found in this workspace.');
    }

    const scan = await createScan({
      orgId: ctx.org.id,
      orgPlan: ctx.org.plan,
      userId: null,
      siteEnvironmentId: environmentId!,
      ...(body.scenarios ? { scenarios: body.scenarios } : {}),
      triggerType: 'api',
    });
    if (idempotencyKey) {
      await sql`insert into idempotency_keys (organization_id, key, scan_id) values (${ctx.org.id}, ${idempotencyKey}, ${scan.id})
        on conflict (organization_id, key) do nothing`;
    }
    return json({ data: { id: scan.id, status: scan.status, created_at: scan.created_at } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
