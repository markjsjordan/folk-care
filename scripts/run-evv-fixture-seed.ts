/**
 * One-off runner: seeds the EVV clock-persistence fixture into the real
 * shared dev database (DATABASE_URL from root .env), then exits.
 *
 * Usage: npx tsx scripts/run-evv-fixture-seed.ts
 */
import 'dotenv/config';
import { Database, DatabaseConfig } from '../packages/core/src/db/connection.js';
import { seedDatabase } from '../e2e/setup/seeds/evv-clock-persistence.seed.js';

function parseDatabaseUrl(url: string): DatabaseConfig {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? parseInt(u.port, 10) : 5432,
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: u.searchParams.get('sslmode') === 'require' || u.searchParams.get('channel_binding') === 'require',
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL not set');
  }
  const db = new Database(parseDatabaseUrl(url));
  const healthy = await db.healthCheck();
  if (!healthy) {
    throw new Error('Database health check failed');
  }
  await seedDatabase(db);
  await db.close();
}

main().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
