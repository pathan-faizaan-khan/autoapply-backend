import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('DATABASE_URL is not set. Database connection will fail.');
}

// Disable prefetch as it is not supported for "Transaction" pool mode
export const client = postgres(connectionString || '', { prepare: false });
export const db = drizzle(client, { schema });
