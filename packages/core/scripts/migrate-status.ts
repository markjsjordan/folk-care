/**
 * Database migration status script using Knex
 * 
 * Shows current migration status
 */

import dotenv from "dotenv";
import knex, { Knex } from 'knex';

dotenv.config({ path: '.env', quiet: true });

type MigrationInfo = string | { file?: string; name?: string };

async function showMigrationStatus() {
  console.log('📊 Checking migration status...\n');

  // Determine environment
  const environment = process.env.NODE_ENV || 'development';
  const dbName = environment === 'test' 
    ? (process.env.DB_NAME || 'folkcare') + '_test'
    : process.env.DB_NAME || 'folkcare';

  // Build connection config
  const connection = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: dbName,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
      };

  // Build Knex config inline to avoid tsconfig issues
  const config: Knex.Config = {
    client: 'postgresql',
    connection,
    migrations: {
      directory: './packages/core/migrations',
      tableName: 'knex_migrations',
      extension: 'ts',
      loadExtensions: ['.ts'],
    },
  };

  // Initialize Knex
  const db = knex(config);

  try {
    // Normalize migration extensions in knex_migrations if previously recorded with .js
    const hasMigrationsTable = await db.schema.hasTable('knex_migrations');
    if (hasMigrationsTable) {
      await db.raw(`
        UPDATE knex_migrations 
        SET name = regexp_replace(name, '\\.js$', '.ts') 
        WHERE name LIKE '%.js';
      `);
    }
    // Get migration status
    const [completed, pending] = await db.migrate.list();

    console.log(`Environment: ${environment}`);
    console.log(`Database: ${dbName}\n`);

    if (completed.length > 0) {
      console.log('✅ Completed migrations:');
      completed.forEach((migration: MigrationInfo) => {
        const name = typeof migration === 'string' ? migration : migration.file || migration.name;
        console.log(`   ${name}`);
      });
    } else {
      console.log('✅ No migrations have been run yet.');
    }

    if (pending.length > 0) {
      console.log('\n⏳ Pending migrations:');
      pending.forEach((migration: MigrationInfo) => {
        const name = typeof migration === 'string' ? migration : migration.file || migration.name;
        console.log(`   ${name}`);
      });
    } else {
      console.log('\n✨ Database is up to date!');
    }

    console.log(`\n📈 Summary: ${completed.length} completed, ${pending.length} pending`);
  } catch (error) {
    console.error('❌ Failed to check migration status:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

// Show migration status
showMigrationStatus().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
