CREATE TABLE "selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"target_id" integer,
	"cold_email_id" integer,
	"job_application_id" integer,
	"company" varchar(255) NOT NULL,
	"role" varchar(255),
	"offer_body" text,
	"offer_url" varchar(1000),
	"recruiter_name" varchar(255),
	"recruiter_email" varchar(255),
	"received_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interviews" ADD COLUMN "job_application_id" integer;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "application_type" varchar(50) DEFAULT 'platform' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_applications" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "outreach_targets" ADD COLUMN "reply_body" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_refresh_token" varchar(500);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gmail_history_id" varchar(100);--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_target_id_outreach_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."outreach_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_cold_email_id_cold_emails_id_fk" FOREIGN KEY ("cold_email_id") REFERENCES "public"."cold_emails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selections" ADD CONSTRAINT "selections_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_application_id_job_applications_id_fk" FOREIGN KEY ("job_application_id") REFERENCES "public"."job_applications"("id") ON DELETE cascade ON UPDATE no action;