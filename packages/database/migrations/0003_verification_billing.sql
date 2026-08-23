-- Domain verification tokens, Stripe subscription state, webhook idempotency.

alter table sites add column verification_token text;
-- Backfill existing rows with a random token (new sites get tokens app-side).
update sites set verification_token = md5(gen_random_uuid()::text || id::text) where verification_token is null;

alter table organizations add column subscription_status text not null default 'none'; -- none | active | past_due | canceled
alter table organizations add column stripe_customer_id text;
alter table organizations add column stripe_subscription_id text;

-- Processed Stripe event ids (webhook idempotency).
create table stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);
