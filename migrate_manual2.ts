import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    await db.execute(sql`
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_refresh_token" varchar(500);
      ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gmail_history_id" varchar(100);
    `);
    console.log('done');
  } catch(e) { console.error(e); }
  process.exit(0);
}
migrate();
