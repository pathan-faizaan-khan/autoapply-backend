import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const sql = postgres(connectionString || '', { prepare: false });

async function runMigration() {
  try {
    console.log('Adding application_type to job_applications...');
    await sql`
      ALTER TABLE job_applications 
      ADD COLUMN IF NOT EXISTS application_type VARCHAR(50) DEFAULT 'platform' NOT NULL;
    `;
    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed', err);
  } finally {
    await sql.end();
  }
}

runMigration();
