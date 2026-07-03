CREATE TABLE "cold_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"target_id" integer,
	"user_id" integer NOT NULL,
	"subject" varchar(500),
	"body" text,
	"tailored_resume_json" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"target_id" integer,
	"company" varchar(255) NOT NULL,
	"role" varchar(255) NOT NULL,
	"date_time" timestamp NOT NULL,
	"platform" varchar(100),
	"link" varchar(1000),
	"notes" text,
	"status" varchar(50) DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"target_roles" text NOT NULL,
	"company_types" text NOT NULL,
	"location_pref" varchar(255),
	"work_style" varchar(50),
	"timeline_days" integer,
	"salary_min" integer,
	"salary_max" integer,
	"target_email_count" integer DEFAULT 10 NOT NULL,
	"emails_sent_count" integer DEFAULT 0 NOT NULL,
	"automation_status" varchar(50) DEFAULT 'idle' NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_targets" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"company_domain" varchar(255),
	"company_linkedin" varchar(500),
	"company_size" varchar(100),
	"job_title" varchar(255),
	"job_url" varchar(1000),
	"job_description" text,
	"match_score" integer,
	"contact_name" varchar(255),
	"contact_title" varchar(255),
	"contact_email" varchar(255),
	"contact_linkedin" varchar(500),
	"contact_github" varchar(500),
	"contact_confidence" varchar(20),
	"status" varchar(50) DEFAULT 'discovered' NOT NULL,
	"response_sentiment" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cold_emails" ADD CONSTRAINT "cold_emails_target_id_outreach_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."outreach_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cold_emails" ADD CONSTRAINT "cold_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_target_id_outreach_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."outreach_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_campaigns" ADD CONSTRAINT "outreach_campaigns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_targets" ADD CONSTRAINT "outreach_targets_campaign_id_outreach_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."outreach_campaigns"("id") ON DELETE cascade ON UPDATE no action;