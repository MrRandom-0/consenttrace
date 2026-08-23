import postgres from 'postgres';

declare global {
  // eslint-disable-next-line no-var
  var __ctSql: ReturnType<typeof postgres> | undefined;
}

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://ct:ct@127.0.0.1:5433/consenttrace';

/** Singleton connection pool (survives Next.js dev hot reloads). */
export const sql =
  globalThis.__ctSql ??
  (globalThis.__ctSql = postgres(DATABASE_URL, {
    max: 10,
    idle_timeout: 30,
    onnotice: () => {},
  }));

/** Serialize arbitrary JSON-safe values for jsonb parameters. */
export function jsonb(value: unknown) {
  return sql.json(value as postgres.JSONValue);
}

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  password_hash: string | null;
}
export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
}
export interface MembershipRow extends OrgRow {
  role: 'owner' | 'admin' | 'analyst' | 'viewer';
}
export interface SiteRow {
  id: string;
  organization_id: string;
  name: string;
  primary_url: string;
  status: string;
  authorized_confirmed_at: string | null;
  created_at: string;
}
export interface EnvRow {
  id: string;
  site_id: string;
  name: string;
  base_url: string;
  default_locale: string;
  enabled: boolean;
}
export interface ScanRow {
  id: string;
  organization_id: string;
  site_environment_id: string;
  trigger_type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  scanner_version: string | null;
  rule_pack_version: string | null;
  browser_version: string | null;
  error_code: string | null;
  error_message: string | null;
  baseline_scan_id: string | null;
  requested_scenarios: string[];
  summary: ScanSummaryJson | null;
  result_artifact_path: string | null;
  report_artifact_path: string | null;
  created_by: string | null;
}
export interface ScanSummaryJson {
  findingCount: number;
  regressionCount: number;
  scenarios: Array<{
    scenario: string;
    status: string;
    cmpProvider: string | null;
    cmpDetected: boolean;
    actionText: string | null;
    cookieCount: number;
    trackingRequestCount: number;
    bannerAfterReload: boolean | null;
  }>;
}
export interface BaselineRow {
  id: string;
  scan_id: string;
  site_environment_id: string;
  note: string | null;
  created_at: string;
  superseded_at: string | null;
}
export interface ScheduleRow {
  id: string;
  organization_id: string;
  site_environment_id: string;
  cron: string;
  timezone: string;
  scenarios: string[];
  enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
}
