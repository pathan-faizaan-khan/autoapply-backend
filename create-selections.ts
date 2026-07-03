import * as dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';

async function run() {
  const sql = postgres(process.env.DATABASE_URL as string);
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS selections (
        id serial PRIMARY KEY,
        user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        target_id integer REFERENCES outreach_targets(id) ON DELETE CASCADE,
        cold_email_id integer REFERENCES cold_emails(id) ON DELETE SET NULL,
        company varchar(255) NOT NULL,
        role varchar(255),
        offer_body text,
        recruiter_name varchar(255),
        recruiter_email varchar(255),
        received_at timestamp NOT NULL DEFAULT NOW(),
        created_at timestamp NOT NULL DEFAULT NOW()
      );
    `;
    console.log('Successfully created selections table');
  } catch (e: any) {
    if (e.message.includes('already exists')) {
      console.log('Table already exists');
    } else {
      console.error(e);
      process.exit(1);
    }
  } finally {
    await sql.end();
  }
}

run();
