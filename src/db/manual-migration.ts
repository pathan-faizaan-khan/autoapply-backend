import { client } from './index.js';

async function main() {
  try {
    await client`ALTER TABLE "interviews" ADD COLUMN IF NOT EXISTS "job_application_id" integer;`;
    await client`ALTER TABLE "job_applications" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;`;
    await client`ALTER TABLE "selections" ADD COLUMN IF NOT EXISTS "job_application_id" integer;`;
    await client`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'interviews_job_application_id_job_applications_id_fk'
        ) THEN
          ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
      END $$;
    `;
    await client`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'selections_job_application_id_job_applications_id_fk'
        ) THEN
          ALTER TABLE "selections" ADD CONSTRAINT "selections_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;
        END IF;
      END $$;
    `;
    console.log('Manual migration success');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}

main();
