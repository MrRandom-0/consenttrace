-- ConsentTrace initial schema (PostgreSQL / Supabase-compatible).
-- Tenancy: every tenant-scoped table carries organization_id; enable RLS on all
-- tenant tables and write policies against organization_members (see docs/AUTHORIZATION.md).
-- Evidence artifacts live in object storage; rows here hold metadata + hashes only.

-- gen_random_uuid() is core PostgreSQL since v13 — no extension required.
-- (pgcrypto intentionally not required; keeps the schema portable to minimal builds.)

-- ── Identity & tenancy ────────────────────────────────────────────────────────
create table users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'free',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create type member_role as enum ('owner', 'admin', 'analyst', 'viewer');

create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  role            member_role not null default 'viewer',
  joined_at       timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- ── Sites & environments ──────────────────────────────────────────────────────
create type site_status as enum ('active', 'paused', 'archived');
create type verification_method as enum ('dns_txt', 'html_meta', 'file', 'manual_admin');

create table sites (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  name                text not null,
  primary_url         text not null,
  status              site_status not null default 'active',
  -- Domain authorization: cloud scanning requires ownership confirmation;
  -- higher volume requires verification (docs/SECURITY.md §domain authorization).
  authorized_confirmed_at timestamptz,
  verified_domain     text,
  verification_method verification_method,
  verified_at         timestamptz,
  verified_by         uuid references users(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index sites_org_idx on sites(organization_id);

create table site_environments (
  id                     uuid primary key default gen_random_uuid(),
  site_id                uuid not null references sites(id) on delete cascade,
  name                   text not null,             -- Production / Staging / Development
  base_url               text not null,
  default_locale         text not null default 'en-GB',
  default_region_profile text,
  enabled                boolean not null default true,
  created_at             timestamptz not null default now()
);
create index site_environments_site_idx on site_environments(site_id);

-- ── Scans ─────────────────────────────────────────────────────────────────────
create type scan_trigger as enum ('manual_extension', 'manual_cloud', 'scheduled', 'api', 'ci');
create type scan_status as enum ('queued', 'running', 'completed', 'failed', 'canceled');

create table scans (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  site_environment_id uuid not null references site_environments(id) on delete cascade,
  trigger_type        scan_trigger not null,
  status              scan_status not null default 'queued',
  started_at          timestamptz,
  completed_at        timestamptz,
  scanner_version     text,
  rule_pack_version   text,
  browser_version     text,
  region_profile      text,
  viewport            jsonb,
  locale              text,
  error_code          text,
  error_message       text,
  baseline_scan_id    uuid references scans(id),
  created_by          uuid references users(id),
  created_at          timestamptz not null default now()
);
create index scans_org_env_idx on scans(organization_id, site_environment_id, created_at desc);

create type scenario_type as enum ('no_action', 'accept_all', 'reject_all', 'essential_only', 'custom_preferences', 'withdraw_consent');
create type scenario_status as enum ('completed', 'completed_with_observations', 'failed', 'skipped');

create table scenario_runs (
  id                uuid primary key default gen_random_uuid(),
  scan_id           uuid not null references scans(id) on delete cascade,
  scenario_type     scenario_type not null,
  status            scenario_status not null,
  started_at        timestamptz,
  completed_at      timestamptz,
  duration_ms       integer,
  action_strategy   text,             -- known_cmp_selector | deterministic_text_match | ai_suggested
  action_confidence text,             -- high | medium | low
  cmp_provider      text,
  cmp_confidence    numeric(3,2),
  banner_after_reload boolean,
  failure_code      text,
  observations      jsonb not null default '[]'
);
create index scenario_runs_scan_idx on scenario_runs(scan_id);

-- ── Observations (values hashed/redacted by default — never raw) ─────────────
create type cookie_category as enum ('strictly_necessary', 'functional', 'analytics', 'advertising', 'unknown');
create type classification_source as enum ('known_signature', 'organization_override', 'ai_suggested', 'unclassified');

create table cookie_observations (
  id                    uuid primary key default gen_random_uuid(),
  scenario_run_id       uuid not null references scenario_runs(id) on delete cascade,
  captured_at           timestamptz not null,
  phase                 text not null,     -- before_page | after_page_load | before_consent_action | immediately_after_action | after_settle | after_reload
  name                  text not null,
  domain                text not null,
  path                  text not null,
  value_hash            text not null,     -- sha256-derived; raw values only in explicit debug mode
  secure                boolean not null,
  http_only             boolean not null,
  same_site             text,
  session               boolean not null,
  expiration            timestamptz,
  partition_information text,
  first_party           boolean not null,
  category              cookie_category not null default 'unknown',
  classification_source classification_source not null default 'unclassified',
  vendor                text
);
create index cookie_obs_run_idx on cookie_observations(scenario_run_id, phase);

create table storage_observations (
  id              uuid primary key default gen_random_uuid(),
  scenario_run_id uuid not null references scenario_runs(id) on delete cascade,
  kind            text not null,           -- localStorage | sessionStorage
  key             text not null,
  value_hash      text not null,
  value_length    integer not null default 0,
  phase           text not null,
  captured_at     timestamptz not null
);
create index storage_obs_run_idx on storage_observations(scenario_run_id);

create type request_category as enum ('analytics', 'advertising', 'personalization', 'functional', 'cdn', 'security', 'unknown');

create table network_observations (
  id              uuid primary key default gen_random_uuid(),
  scenario_run_id uuid not null references scenario_runs(id) on delete cascade,
  url_normalized  text not null,            -- origin + path; query stripped. Never auth headers/bodies.
  domain          text not null,
  method          text not null,
  resource_type   text,
  at_ms           integer not null,
  captured_at     timestamptz not null,
  request_category request_category not null default 'unknown',
  vendor          text,
  third_party     boolean not null,
  blocked         boolean not null default false,
  status          integer
);
create index network_obs_run_idx on network_observations(scenario_run_id, at_ms);

create table consent_actions (
  id                    uuid primary key default gen_random_uuid(),
  scenario_run_id       uuid not null references scenario_runs(id) on delete cascade,
  type                  text not null,
  button_text           text,
  selector_strategy     text,
  element_role          text,
  interaction_at        timestamptz,
  at_ms                 integer,
  confidence            text,
  screenshot_before_id  uuid,
  screenshot_after_id   uuid
);

-- ── Evidence ──────────────────────────────────────────────────────────────────
create type evidence_type as enum ('screenshot', 'cookie_snapshot', 'storage_snapshot', 'network_log', 'consent_timeline', 'html_snippet', 'json_manifest', 'report');

create table evidence_items (
  id              uuid primary key default gen_random_uuid(),
  scan_id         uuid not null references scans(id) on delete cascade,
  scenario_run_id uuid references scenario_runs(id) on delete cascade,
  type            evidence_type not null,
  label           text,
  artifact_path   text not null,             -- object-storage key; access via short-lived signed URLs
  sha256          text not null,
  bytes           bigint not null default 0,
  created_at      timestamptz not null default now()
);
create index evidence_scan_idx on evidence_items(scan_id);

-- ── Findings ──────────────────────────────────────────────────────────────────
create type severity as enum ('info', 'low', 'medium', 'high', 'critical');
create type finding_status as enum ('open', 'acknowledged', 'resolved', 'ignored');

create table findings (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  scan_id           uuid not null references scans(id) on delete cascade,
  scenario_run_id   uuid references scenario_runs(id) on delete cascade,
  rule_id           text not null,
  rule_version      text not null,
  severity          severity not null,
  status            finding_status not null default 'open',
  title             text not null,
  observation       text not null,           -- facts only
  expected_behavior text,
  actual_behavior   text,
  evidence_ids      jsonb not null default '[]',
  regression        boolean not null default false,
  first_detected_at timestamptz not null default now(),
  last_detected_at  timestamptz not null default now(),
  metadata          jsonb not null default '{}'
);
create index findings_org_idx on findings(organization_id, status);
create index findings_scan_idx on findings(scan_id);

-- ── Baselines, reports, schedules ────────────────────────────────────────────
create table baselines (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  site_environment_id uuid not null references site_environments(id) on delete cascade,
  scan_id           uuid not null references scans(id),
  rule_pack_version text,
  scanner_version   text,
  note              text,
  created_by        uuid references users(id),
  created_at        timestamptz not null default now(),
  superseded_at     timestamptz               -- baselines are never silently replaced
);
create index baselines_env_idx on baselines(site_environment_id, created_at desc);

create table reports (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  scan_id       uuid not null references scans(id) on delete cascade,
  type          text not null,                -- executive | technical | evidence | regression | summary
  generated_at  timestamptz not null default now(),
  artifact_path text not null,
  sha256        text not null,
  brand_config  jsonb
);

create table scan_schedules (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  site_environment_id uuid not null references site_environments(id) on delete cascade,
  cron                text not null,
  timezone            text not null default 'UTC',
  scenarios           jsonb not null default '["no_action","reject_all","accept_all"]',
  enabled             boolean not null default true,
  last_run_at         timestamptz,
  next_run_at         timestamptz,
  created_by          uuid references users(id),
  created_at          timestamptz not null default now()
);

create table notification_destinations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  kind            text not null,              -- email | slack_webhook | teams | webhook
  target          text not null,              -- address / URL (webhook secrets in secret storage, not here)
  events          jsonb not null default '["regression","scan_failed"]',
  enabled         boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── Rules & overrides ─────────────────────────────────────────────────────────
create table rule_packs (
  id               uuid primary key default gen_random_uuid(),
  version          text not null unique,
  profile          text not null default 'technical_baseline',
  last_reviewed_at timestamptz,
  review_notes     text,
  created_at       timestamptz not null default now()
);

create table organization_rule_config (
  organization_id uuid not null references organizations(id) on delete cascade,
  rule_id         text not null,
  enabled         boolean not null default true,
  severity_override severity,
  primary key (organization_id, rule_id)
);

create table cookie_overrides (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  pattern         text not null,
  is_regex        boolean not null default false,
  category        cookie_category not null,
  vendor          text,
  note            text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

create table domain_overrides (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  domain          text not null,
  category        request_category not null,
  vendor          text,
  note            text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now()
);

-- ── AI governance ─────────────────────────────────────────────────────────────
create table prompt_versions (
  id                uuid primary key default gen_random_uuid(),
  prompt_id         text not null,             -- e.g. CMP_DETECTION
  version           text not null,
  purpose           text,
  input_schema      jsonb,
  output_schema     jsonb,
  created_at        timestamptz not null default now(),
  last_evaluated_at timestamptz,
  owner             text,
  unique (prompt_id, version)
);

create table ai_invocations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  scan_id           uuid references scans(id) on delete set null,
  feature           text not null,             -- cmp_detection | action_classifier | cookie_classifier | selector_healer | regression_summary | report_narrative
  prompt_version    text not null,
  model             text not null,
  input_hash        text not null,             -- raw payloads are NOT logged unless admin debug mode
  redaction_applied boolean not null default true,
  started_at        timestamptz not null,
  completed_at      timestamptz,
  status            text not null,
  confidence        text,
  cost_usd          numeric(10,6)
);
create index ai_invocations_org_idx on ai_invocations(organization_id, started_at desc);

-- ── Audit log ─────────────────────────────────────────────────────────────────
create table audit_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id   uuid references users(id),
  event           text not null,              -- site_created | baseline_changed | finding_ignored | ...
  resource_type   text,
  resource_id     text,
  metadata        jsonb not null default '{}',
  created_at      timestamptz not null default now()
);
create index audit_org_idx on audit_log(organization_id, created_at desc);
