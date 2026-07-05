import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from './index.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  console.log('Migrations complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
