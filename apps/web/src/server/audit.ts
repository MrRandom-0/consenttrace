import { jsonb, sql } from './db';

export type AuditEvent =
  | 'site_created'
  | 'site_deleted'
  | 'scan_started'
  | 'scan_completed'
  | 'scan_failed'
  | 'baseline_changed'
  | 'schedule_created'
  | 'schedule_updated'
  | 'schedule_deleted'
  | 'member_added'
  | 'member_removed'
  | 'subscription_changed'
  | 'domain_verified'
  | 'finding_ignored'
  | 'api_key_created'
  | 'api_key_revoked';

export async function audit(
  orgId: string,
  actorUserId: string | null,
  event: AuditEvent,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await sql`insert into audit_log (organization_id, actor_user_id, event, resource_type, resource_id, metadata)
    values (${orgId}, ${actorUserId}, ${event}, ${resourceType}, ${resourceId}, ${jsonb(metadata)})`;
}
