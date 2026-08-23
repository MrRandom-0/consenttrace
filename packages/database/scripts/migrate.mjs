/**
 * Minimal, reviewable migration runner: applies migrations/*.sql in filename
 * order inside transactions, tracked in schema_migrations. No down migrations —
 * forward-only with explicit new files (docs/DATABASE.md).
 *
 * Usage: DATABASE_URL=postgres://... node scripts/migrate.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '../migrations');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
await sql`create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`;

const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));

for (const file of files) {
  if (applied.has(file)) continue;
  const body = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
  console.log('applying', file);
  await sql.begin(async (tx) => {
    await tx.unsafe(body);
    await tx`insert into schema_migrations (name) values (${file})`;
  });
}
console.log('migrations up to date (' + files.length + ' total)');
await sql.end();
