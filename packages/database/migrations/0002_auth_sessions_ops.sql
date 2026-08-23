-- Auth (self-hosted credentials mode), session store, and scan-queue/result columns.
-- Production deployments using Supabase Auth keep password_hash null and map
-- Supabase user ids into users.id (docs/AUTHORIZATION.md).

alter table users add column password_hash text;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  token_hash   text not null unique,          -- sha256 of the bearer token; raw token never stored
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz
);
create index sessions_user_idx on sessions(user_id);
create index sessions_expiry_idx on sessions(expires_at);

-- The scans table doubles as the job queue: claim via FOR UPDATE SKIP LOCKED
-- (packages queue abstraction). These columns support claiming + results.
alter table scans add column requested_scenarios jsonb not null default '["no_action","reject_all","accept_all"]';
alter table scans add column claimed_at timestamptz;
alter table scans add column worker_id text;
alter table scans add column summary jsonb;                 -- compact per-scenario summary for list views
alter table scans add column result_artifact_path text;     -- scan.json object key
alter table scans add column report_artifact_path text;     -- report.html object key

create index scans_queue_idx on scans(status, created_at) where status = 'queued';
