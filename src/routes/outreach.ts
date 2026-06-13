import { Router } from 'express';
import { db } from '../db/index.js';
import {
  outreachCampaigns,
  outreachTargets,
  coldEmails,
  resumes,
  resumePersonalInfo,
  resumeExperiences,
  resumeSkills,
  resumeProjects,
  resumeEducations,
  users,
} from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import { generateResumeHtml } from '../utils/resumeTemplate.js';
import { runAutomationEngine } from '../utils/automationEngine.js';

const router = Router();

const getUserId = (req: any) => req.user?.userId || 1;

// ─── CAMPAIGNS ───────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns — list all campaigns for user
router.get('/campaigns', async (req: any, res) => {
  try {
    const campaigns = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.userId, getUserId(req)))
      .orderBy(desc(outreachCampaigns.createdAt));
    res.json({ campaigns });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// POST /api/outreach/campaigns — create new campaign from wizard
router.post('/campaigns', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { targetRoles, companyTypes, locationPref, workStyle, timelineDays, salaryMin, salaryMax } = req.body;

    const [campaign] = await db.insert(outreachCampaigns).values({
      userId,
      targetRoles: JSON.stringify(targetRoles || []),
      companyTypes: JSON.stringify(companyTypes || []),
      locationPref: locationPref || null,
      workStyle: workStyle || null,
      timelineDays: timelineDays || null,
      salaryMin: salaryMin || null,
      salaryMax: salaryMax || null,
    }).returning();

    res.status(201).json({ campaign });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// GET /api/outreach/campaigns/:id — get a specific campaign status
router.get('/campaigns/:id', async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const [campaign] = await db.select().from(outreachCampaigns).where(eq(outreachCampaigns.id, campaignId));
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json({ campaign });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// POST /api/outreach/campaigns/:id/automate — trigger the automated engine
router.post('/campaigns/:id/automate', async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.id);
    const { targetEmailCount, googleAccessToken, fastApiUrl } = req.body;
    
    if (!googleAccessToken) {
      return res.status(400).json({ error: 'Google Access Token is required for automation' });
    }

    // Update campaign configuration
    await db.update(outreachCampaigns)
      .set({ 
        targetEmailCount: targetEmailCount || 10,
        automationStatus: 'starting'
      })
      .where(eq(outreachCampaigns.id, campaignId));

    // Start background process (do not await)
    runAutomationEngine(campaignId, targetEmailCount || 10, googleAccessToken, fastApiUrl || 'http://localhost:8000')
      .catch(e => console.error("Automation Engine Crash:", e));

    res.status(202).json({ message: 'Automation started', campaignId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start automation' });
  }
});

// DELETE /api/outreach/campaigns/:id
router.delete('/campaigns/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(outreachCampaigns).where(
      and(eq(outreachCampaigns.id, id), eq(outreachCampaigns.userId, getUserId(req)))
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

// ─── TARGETS ─────────────────────────────────────────────────────────────────

// GET /api/outreach/campaigns/:campaignId/targets
router.get('/campaigns/:campaignId/targets', async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const targets = await db
      .select()
      .from(outreachTargets)
      .where(eq(outreachTargets.campaignId, campaignId))
      .orderBy(desc(outreachTargets.matchScore));
    res.json({ targets });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch targets' });
  }
});

// POST /api/outreach/campaigns/:campaignId/targets — bulk upsert targets from search results
router.post('/campaigns/:campaignId/targets', async (req: any, res) => {
  try {
    const campaignId = parseInt(req.params.campaignId);
    const { targets } = req.body; // array of target objects

    const inserted = await db.insert(outreachTargets).values(
      targets.map((t: any) => ({
        campaignId,
        companyName: t.companyName,
        companyDomain: t.companyDomain || null,
        companyLinkedin: t.companyLinkedin || null,
        companySize: t.companySize || null,
        jobTitle: t.jobTitle || null,
        jobUrl: t.jobUrl || null,
        jobDescription: t.jobDescription || null,
        matchScore: t.matchScore || null,
        contactName: t.contactName || null,
        contactTitle: t.contactTitle || null,
        contactEmail: t.contactEmail || null,
        contactLinkedin: t.contactLinkedin || null,
        contactGithub: t.contactGithub || null,
        contactConfidence: t.contactConfidence || null,
      }))
    ).returning();

    res.status(201).json({ targets: inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save targets' });
  }
});

// PATCH /api/outreach/targets/:id — update contact info or status
router.patch('/targets/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    const [updated] = await db.update(outreachTargets).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(outreachTargets.id, id)).returning();
    res.json({ target: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update target' });
  }
});

// ─── COLD EMAILS ─────────────────────────────────────────────────────────────

// GET /api/outreach/emails?targetId=X
router.get('/emails', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const targetId = req.query.targetId ? parseInt(req.query.targetId as string) : undefined;

    const conditions = [eq(coldEmails.userId, userId)];
    if (targetId) conditions.push(eq(coldEmails.targetId, targetId));

    const emails = await db.select().from(coldEmails)
      .where(and(...conditions))
      .orderBy(desc(coldEmails.createdAt));

    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// GET /api/outreach/history — get history of all sent emails with rich target info
router.get('/history', async (req: any, res) => {
  try {
    const userId = getUserId(req);

    const history = await db.select({
      email: coldEmails,
      target: outreachTargets,
      campaign: outreachCampaigns,
    })
    .from(coldEmails)
    .leftJoin(outreachTargets, eq(coldEmails.targetId, outreachTargets.id))
    .leftJoin(outreachCampaigns, eq(outreachTargets.campaignId, outreachCampaigns.id))
    .where(eq(coldEmails.userId, userId))
    .orderBy(desc(coldEmails.createdAt));

    res.json({ history });
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: 'Failed to fetch outreach history' });
  }
});

// POST /api/outreach/emails — save a generated draft
router.post('/emails', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { targetId, subject, body, tailoredResumeJson } = req.body;

    const [email] = await db.insert(coldEmails).values({
      userId,
      targetId,
      subject,
      body,
      tailoredResumeJson: tailoredResumeJson ? JSON.stringify(tailoredResumeJson) : null,
      status: 'draft',
    }).returning();

    res.status(201).json({ email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save email draft' });
  }
});

// PATCH /api/outreach/emails/:id — update draft or mark as sent
router.patch('/emails/:id', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const updates = req.body;
    if (updates.status === 'sent') updates.sentAt = new Date();

    const [updated] = await db.update(coldEmails).set({
      ...updates,
      updatedAt: new Date(),
    }).where(eq(coldEmails.id, id)).returning();

    res.json({ email: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// POST /api/outreach/emails/:id/send — send email via Gmail API
router.post('/emails/:id/send', async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const { googleAccessToken, toEmail } = req.body;
    
    if (!googleAccessToken || !toEmail) {
      return res.status(400).json({ error: 'Missing googleAccessToken or toEmail' });
    }

    const [email] = await db.select().from(coldEmails).where(eq(coldEmails.id, id));
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const [user] = await db.select().from(users).where(eq(users.id, email.userId));

    // Construct MIME Multipart Email
    const boundary = 'boundary12345';
    const messageParts = [
      `To: ${toEmail}`,
      `Subject: ${email.subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      email.body,
      ''
    ];

    if (email.tailoredResumeJson) {
      let pdfBuffer: Buffer;
      try {
        const resumeData = JSON.parse(email.tailoredResumeJson);
        const htmlContent = generateResumeHtml(resumeData);
        
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const uint8Array = await page.pdf({ format: 'A4', printBackground: true });
        pdfBuffer = Buffer.from(uint8Array);
        await browser.close();
      } catch (e) {
        console.error("Error generating tailored resume PDF with puppeteer:", e);
        pdfBuffer = Buffer.from("Error generating tailored resume PDF.");
      }

      const base64Resume = pdfBuffer.toString('base64');
      
      messageParts.push(
        `--${boundary}`,
        `Content-Type: application/pdf; name="Tailored_Resume.pdf"`,
        `Content-Disposition: attachment; filename="Tailored_Resume.pdf"`,
        `Content-Transfer-Encoding: base64`,
        '',
        base64Resume,
        ''
      );
    }
    
    messageParts.push(`--${boundary}--`);

    const rawMessage = messageParts.join('\r\n');
    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Call Gmail API
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    if (!gmailRes.ok) {
      const errorData = await gmailRes.text();
      console.error('Gmail API Error:', errorData);
      return res.status(500).json({ error: 'Failed to send via Gmail API' });
    }

    // Mark as sent in DB
    const [updated] = await db.update(coldEmails).set({
      status: 'sent',
      sentAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(coldEmails.id, id)).returning();

    res.json({ email: updated, success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// GET /api/outreach/resume-context — get the user's latest resume data for AI context
router.get('/resume-context', async (req: any, res) => {
  try {
    const userId = getUserId(req);

    const [latestResume] = await db.select().from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);

    if (!latestResume) return res.status(404).json({ error: 'No resume found' });

    const [personalInfo] = await db.select().from(resumePersonalInfo)
      .where(eq(resumePersonalInfo.resumeId, latestResume.id));
    const experiences = await db.select().from(resumeExperiences)
      .where(eq(resumeExperiences.resumeId, latestResume.id));
    const skills = await db.select().from(resumeSkills)
      .where(eq(resumeSkills.resumeId, latestResume.id));
    const projects = await db.select().from(resumeProjects)
      .where(eq(resumeProjects.resumeId, latestResume.id));
    const education = await db.select().from(resumeEducations)
      .where(eq(resumeEducations.resumeId, latestResume.id));

    res.json({
      resumeId: latestResume.id,
      personalInfo,
      summary: personalInfo?.summary || '',
      experience: experiences,
      skills: skills.map(s => s.name),
      projects,
      education
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch resume context' });
  }
});

export default router;
