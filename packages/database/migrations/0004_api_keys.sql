-- Public /v1 API: org-scoped API keys (hashed at rest, shown once) and
-- idempotency keys for safe scan-creation retries.

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name          text not null,
  -- sha256 of the full token; the plaintext token is returned exactly once at creation.
  token_hash    text not null unique,
  -- First characters of the token (e.g. "ct_live_a1b2") for identification in the UI.
  token_prefix  text not null,
  scope         text not null default 'write',   -- read | write
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index api_keys_org_idx on api_keys(organization_id);

create table idempotency_keys (
  organization_id uuid not null references organizations(id) on delete cascade,
  key             text not null,
  scan_id         uuid not null references scans(id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (organization_id, key)
);
