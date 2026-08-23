# Database

**Purpose:** operational database practices. **Owner:** _placeholder_. **Last reviewed:** 2026-08-23.

## Engine

PostgreSQL 15+ (developed and integration-tested against **real PostgreSQL 17**). Local development boots embedded Postgres binaries (`packages/database/scripts/dev-db.mjs` → `postgres://ct:ct@127.0.0.1:5433/consenttrace`); staging/production use managed Postgres (Supabase or equivalent) with **the same migration files**. One database per environment — never shared.

## Migrations

Forward-only numbered SQL files in `packages/database/migrations/`, applied in filename order inside transactions and tracked in `schema_migrations` (`scripts/migrate.mjs`). No down migrations: corrections are new migrations. Every schema change lands with matching updates to `@consenttrace/shared` types and DATA_MODEL.md in the same commit (Documentation Update Rule).

- `0001_init.sql` — full core schema (tenancy, sites/verification, scans, observations, evidence, findings, baselines, schedules, overrides, AI governance, audit). Uses core `gen_random_uuid()` (PG13+); no extensions required.
- `0002_auth_sessions_ops.sql` — credentials auth (nullable `password_hash`), hashed-token sessions, queue-claim and result columns on `scans`, partial index for the queue.

## Queue

The `scans` table doubles as the job queue: `claimNextQueuedScan` uses `FOR UPDATE SKIP LOCKED` on `status='queued'` (partial index `scans_queue_idx`), stamping `claimed_at`/`worker_id`. Integration tests prove oldest-first claiming with no double-claims. A dedicated broker can replace this behind the same function without touching callers.

## Access layer

`postgres` (porsager) tagged templates — every value is parameterized; `sql.unsafe` appears only in the migration runner for reviewed DDL files. JSONB writes go through a typed `jsonb()` helper. Connection pool: max 10, singleton across Next.js reloads.

## RLS posture

Self-hosted mode enforces tenancy in the API layer (every query scoped by `organization_id`). Supabase deployments add RLS policies mirroring those predicates over the same schema (membership check via `organization_members`); policy files ship with the Supabase deployment guide (Phase 3).

## Backups & retention

Managed-Postgres PITR in production; evidence bytes live in object storage (DB stores hashes/metadata, so integrity is checkable after restores). Retention sweeper (Phase 3) deletes expired evidence rows + objects per plan.
