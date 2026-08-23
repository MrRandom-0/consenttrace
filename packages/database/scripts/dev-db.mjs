/**
 * Local development database: boots a REAL PostgreSQL 17 server (embedded
 * binaries), creates the consenttrace database and applies migrations.
 * Production uses managed Postgres/Supabase with the same migration files.
 *
 * Usage: node scripts/dev-db.mjs            (keeps running; Ctrl+C to stop)
 *        node scripts/dev-db.mjs --once     (start, migrate, keep running, print DSN)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, '../.pgdata');
const PORT = Number(process.env.CT_PG_PORT ?? 5433);
const DSN = `postgres://ct:ct@127.0.0.1:${PORT}/consenttrace`;

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'ct',
  password: 'ct',
  port: PORT,
  persistent: true,
});

if (!existsSync(join(DATA_DIR, 'PG_VERSION'))) {
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase('consenttrace');
} catch {
  /* already exists */
}

const migrate = spawnSync('node', [join(here, 'migrate.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, DATABASE_URL: DSN },
});
if (migrate.status !== 0) {
  await pg.stop();
  process.exit(migrate.status ?? 1);
}

console.log('\nDATABASE_URL=' + DSN);
console.log('PostgreSQL 17 running. Ctrl+C to stop.');

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
