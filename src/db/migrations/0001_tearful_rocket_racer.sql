CREATE TABLE "resume_certifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"name" varchar(255),
	"issuer" varchar(255),
	"date" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "resume_educations" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"degree" varchar(255),
	"institution" varchar(255),
	"year" varchar(50),
	"gpa" varchar(50)
);
--> statement-breakpoint
CREATE TABLE "resume_experiences" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"job_title" varchar(255),
	"company_name" varchar(255),
	"date_range" varchar(100),
	"description" text
);
--> statement-breakpoint
CREATE TABLE "resume_languages" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"name" varchar(255),
	"proficiency" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "resume_personal_info" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"name" varchar(255),
	"email" varchar(255),
	"phone" varchar(50),
	"linkedin_url" varchar(500),
	"github_url" varchar(500),
	"portfolio_url" varchar(500),
	"summary" text,
	CONSTRAINT "resume_personal_info_resume_id_unique" UNIQUE("resume_id")
);
--> statement-breakpoint
CREATE TABLE "resume_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"name" varchar(255),
	"technologies" varchar(500),
	"description" text,
	"link" varchar(1000)
);
--> statement-breakpoint
CREATE TABLE "resume_skills" (
	"id" serial PRIMARY KEY NOT NULL,
	"resume_id" integer NOT NULL,
	"name" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"s3_url" varchar(1000),
	"file_name" varchar(255),
	"ats_score" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scraped_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"job_url" varchar(1000) NOT NULL,
	"location" varchar(255),
	"description" text,
	"launch_date" timestamp,
	"end_date" timestamp,
	"applied_peoples" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scraped_jobs_job_url_unique" UNIQUE("job_url")
);
--> statement-breakpoint
ALTER TABLE "resume_certifications" ADD CONSTRAINT "resume_certifications_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_educations" ADD CONSTRAINT "resume_educations_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_experiences" ADD CONSTRAINT "resume_experiences_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_languages" ADD CONSTRAINT "resume_languages_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_personal_info" ADD CONSTRAINT "resume_personal_info_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_projects" ADD CONSTRAINT "resume_projects_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_skills" ADD CONSTRAINT "resume_skills_resume_id_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."resumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;