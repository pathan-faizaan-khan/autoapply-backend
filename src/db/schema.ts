import { pgTable, serial, varchar, timestamp, boolean, integer, text } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }), // Nullable for Google Auth users
  name: varchar('name', { length: 255 }),
  googleId: varchar('google_id', { length: 255 }).unique(),
  isVerified: boolean('is_verified').default(false).notNull(),
  googleRefreshToken: varchar('google_refresh_token', { length: 500 }),
  gmailHistoryId: varchar('gmail_history_id', { length: 100 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const otps = pgTable('otps', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  code: varchar('code', { length: 10 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const userProfiles = pgTable('user_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull().unique(),
  resumeText: text('resume_text'),
  linkedInUrl: varchar('linkedin_url', { length: 255 }),
  githubUrl: varchar('github_url', { length: 255 }),
  portfolioUrl: varchar('portfolio_url', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  address: varchar('address', { length: 255 }),
  skills: text('skills'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const jobApplications = pgTable('job_applications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  jobTitle: varchar('job_title', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  jobUrl: varchar('job_url', { length: 1000 }),
  status: varchar('status', { length: 50 }).default('APPLIED').notNull(),
  appliedAt: timestamp('applied_at').defaultNow().notNull(),
});

// --- NEW RESUME TABLES ---

export const resumes = pgTable('resumes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  s3Url: varchar('s3_url', { length: 1000 }),
  fileName: varchar('file_name', { length: 255 }),
  atsScore: integer('ats_score'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const resumePersonalInfo = pgTable('resume_personal_info', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull().unique(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 50 }),
  linkedinUrl: varchar('linkedin_url', { length: 500 }),
  githubUrl: varchar('github_url', { length: 500 }),
  portfolioUrl: varchar('portfolio_url', { length: 500 }),
  summary: text('summary'),
});

export const resumeExperiences = pgTable('resume_experiences', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  jobTitle: varchar('job_title', { length: 255 }),
  companyName: varchar('company_name', { length: 255 }),
  dateRange: varchar('date_range', { length: 100 }),
  description: text('description'),
});

export const resumeEducations = pgTable('resume_educations', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  degree: varchar('degree', { length: 255 }),
  institution: varchar('institution', { length: 255 }),
  year: varchar('year', { length: 50 }),
  gpa: varchar('gpa', { length: 50 }),
});

export const resumeSkills = pgTable('resume_skills', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
});

export const resumeProjects = pgTable('resume_projects', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }),
  technologies: varchar('technologies', { length: 500 }),
  description: text('description'),
  link: varchar('link', { length: 1000 }),
});

export const resumeLanguages = pgTable('resume_languages', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }),
  proficiency: varchar('proficiency', { length: 255 }),
});

export const resumeCertifications = pgTable('resume_certifications', {
  id: serial('id').primaryKey(),
  resumeId: integer('resume_id').references(() => resumes.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }),
  issuer: varchar('issuer', { length: 255 }),
  date: varchar('date', { length: 100 }),
});

// --- OUTREACH & COLD MAIL TABLES ---

export const outreachCampaigns = pgTable('outreach_campaigns', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetRoles: text('target_roles').notNull(),          // JSON array of role strings
  companyTypes: text('company_types').notNull(),        // JSON array: startup|midsize|enterprise|faang|any
  locationPref: varchar('location_pref', { length: 255 }), // e.g. "Remote" | "New York"
  workStyle: varchar('work_style', { length: 50 }),     // remote|hybrid|onsite
  timelineDays: integer('timeline_days'),               // e.g. 30, 90, 180
  salaryMin: integer('salary_min'),
  salaryMax: integer('salary_max'),
  targetEmailCount: integer('target_email_count').default(10).notNull(),
  emailsSentCount: integer('emails_sent_count').default(0).notNull(),
  automationStatus: varchar('automation_status', { length: 50 }).default('idle').notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const outreachTargets = pgTable('outreach_targets', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => outreachCampaigns.id, { onDelete: 'cascade' }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  companyDomain: varchar('company_domain', { length: 255 }),
  companyLinkedin: varchar('company_linkedin', { length: 500 }),
  companySize: varchar('company_size', { length: 100 }),
  jobTitle: varchar('job_title', { length: 255 }),      // matched role at this company
  jobUrl: varchar('job_url', { length: 1000 }),
  jobDescription: text('job_description'),
  matchScore: integer('match_score'),                   // 0-100 AI match score
  // Contact info discovered
  contactName: varchar('contact_name', { length: 255 }),
  contactTitle: varchar('contact_title', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactLinkedin: varchar('contact_linkedin', { length: 500 }),
  contactGithub: varchar('contact_github', { length: 500 }),
  contactConfidence: varchar('contact_confidence', { length: 20 }), // high|medium|low
  status: varchar('status', { length: 50 }).default('discovered').notNull(), // discovered|emailed|replied|ignored|replied_positive|replied_negative
  responseSentiment: varchar('response_sentiment', { length: 50 }), // positive|negative|neutral
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const coldEmails = pgTable('cold_emails', {
  id: serial('id').primaryKey(),
  targetId: integer('target_id').references(() => outreachTargets.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id).notNull(),
  subject: varchar('subject', { length: 500 }),
  body: text('body'),
  tailoredResumeJson: text('tailored_resume_json'),     // JSON of tailored resume data
  status: varchar('status', { length: 50 }).default('draft').notNull(), // draft|sent|opened|replied
  sentAt: timestamp('sent_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const scrapedJobs = pgTable('scraped_jobs', {
  id: serial('id').primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  jobUrl: varchar('job_url', { length: 1000 }).notNull().unique(),
  location: varchar('location', { length: 255 }),
  description: text('description'),
  launchDate: timestamp('launch_date'),
  endDate: timestamp('end_date'),
  appliedPeoples: integer('applied_peoples'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// --- INTERVIEWS ---

export const interviews = pgTable('interviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  targetId: integer('target_id').references(() => outreachTargets.id, { onDelete: 'cascade' }),
  company: varchar('company', { length: 255 }).notNull(),
  role: varchar('role', { length: 255 }).notNull(),
  dateTime: timestamp('date_time').notNull(),
  platform: varchar('platform', { length: 100 }),
  link: varchar('link', { length: 1000 }),
  notes: text('notes'),
  status: varchar('status', { length: 50 }).default('scheduled').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

