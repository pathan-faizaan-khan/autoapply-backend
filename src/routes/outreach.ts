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
  interviews,
  selections,
} from '../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import { generateResumeHtml } from '../utils/resumeTemplate.js';
import { runAutomationEngine } from '../utils/automationEngine.js';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { GoogleGenAI } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';

const router = Router();

const getUserId = (req: any) => req.user!.userId;

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
    runAutomationEngine(campaignId, targetEmailCount || 10, googleAccessToken, fastApiUrl || 'https://autoapply-scraper-backend.onrender.com')
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

// GET /api/outreach/selected — returns all job offers from the selections table
router.get('/selected', async (req: any, res) => {
  try {
    const userId = getUserId(req);

    const selected = await db.select({
      selection: selections,
      target: outreachTargets,
    })
    .from(selections)
    .leftJoin(outreachTargets, eq(selections.targetId, outreachTargets.id))
    .where(eq(selections.userId, userId))
    .orderBy(desc(selections.receivedAt));

    res.json({ selected });
  } catch (err) {
    console.error("Selected fetch error:", err);
    res.status(500).json({ error: 'Failed to fetch selections' });
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
    const { toEmail } = req.body;
    
    if (!toEmail) {
      return res.status(400).json({ error: 'Missing toEmail' });
    }

    const [email] = await db.select().from(coldEmails).where(eq(coldEmails.id, id));
    if (!email) return res.status(404).json({ error: 'Email not found' });

    const [user] = await db.select().from(users).where(eq(users.id, email.userId));
    if (!user || !user.googleRefreshToken) {
      return res.status(401).json({ error: 'User has not connected Gmail' });
    }

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
    const { token } = await oauth2Client.getAccessToken();
    const googleAccessToken = token;

    if (!googleAccessToken) return res.status(500).json({ error: 'Failed to generate access token' });

    const mailOptions: any = {
      to: toEmail,
      subject: email.subject,
      text: email.body,
      attachments: []
    };

    if (email.tailoredResumeJson) {
      let pdfBuffer: Buffer;
      try {
        const resumeData = JSON.parse(email.tailoredResumeJson);
        const htmlContent = generateResumeHtml(resumeData);
        
        const browser = await puppeteer.launch({ 
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const uint8Array = await page.pdf({ format: 'A4', printBackground: true });
        pdfBuffer = Buffer.from(uint8Array);
        await browser.close();
      } catch (e: any) {
        console.error("Error generating tailored resume PDF with puppeteer:", e);
        return res.status(500).json({ error: `Puppeteer failed to generate PDF: ${e.message}` });
      }

      mailOptions.attachments.push({
        filename: 'Tailored_Resume.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      });
    }

    const mail = new MailComposer(mailOptions);
    const message = await mail.compile().build();
    const encodedMessage = message.toString('base64url');

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

// POST /api/outreach/sync-replies — fetch recent Gmails and classify replies
router.post('/sync-replies', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { googleAccessToken } = req.body;
    if (!googleAccessToken) return res.status(400).json({ error: 'googleAccessToken is required' });

    // Fetch sent cold emails for this user to match replies against
    const sentEmails = await db.select({
      emailId: coldEmails.id,
      targetId: coldEmails.targetId,
      subject: coldEmails.subject,
      contactEmail: outreachTargets.contactEmail,
      company: outreachTargets.companyName,
      role: outreachTargets.jobTitle
    })
    .from(coldEmails)
    .leftJoin(outreachTargets, eq(coldEmails.targetId, outreachTargets.id))
    .where(and(eq(coldEmails.userId, userId), eq(coldEmails.status, 'sent')));

    if (sentEmails.length === 0) {
      return res.json({ success: true, processed: 0, message: "No sent emails to match" });
    }

    // Fetch recent received emails from gmail
    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox newer_than:7d', {
      headers: { 'Authorization': `Bearer ${googleAccessToken}` }
    });
    const { messages } = await gmailRes.json();
    if (!messages || messages.length === 0) return res.json({ success: true, processed: 0 });

    let processedCount = 0;
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

    for (const msg of messages.slice(0, 10)) { // limit to 10 for demo/performance
      const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
        headers: { 'Authorization': `Bearer ${googleAccessToken}` }
      });
      const msgData = await msgRes.json();
      
      const headers = msgData.payload?.headers || [];
      const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || '';
      const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || '';
      
      // Strict matching: only process if it matches the contact email or the exact thread subject sent by platform
      const matchedEmail = sentEmails.find(se => 
        (se.contactEmail && fromHeader.includes(se.contactEmail)) || 
        (se.subject && subjectHeader.replace(/^(Re|Fwd):\s*/i, '').trim() === se.subject?.trim())
      );

      if (!matchedEmail) continue;

      const bodySnippet = msgData.snippet || '';
      let sentiment = 'neutral';
      let date_time = new Date().toISOString();
      let platform = 'Other';
      let link = '';
      
      if (process.env.GEMINI_API_KEY) {
        try {
          const prompt = `Analyze this HR email reply. Determine if it is a positive possibility (scheduling an interview) or negative (rejection). 
Email: "${bodySnippet}"
Respond in strict JSON format: {"sentiment": "positive" | "negative" | "neutral", "dateTime": "ISO 8601 string if positive, else null", "platform": "Google Meet/Zoom/Teams/Other if positive", "link": "meeting link if present"}`;
          const aiResponse = await ai.models.generateContent({
             model: 'gemini-2.5-flash',
             contents: prompt,
             config: { responseMimeType: 'application/json' }
          });
          const result = JSON.parse(aiResponse.text || '{}');
          sentiment = result.sentiment || 'neutral';
          if (result.dateTime) date_time = result.dateTime;
          if (result.platform) platform = result.platform;
          if (result.link) link = result.link;
        } catch(e) { console.error("GenAI parse error", e); }
      } else {
        // Fallback keyword mock logic if no API key
        const lowerBody = bodySnippet.toLowerCase();
        if (lowerBody.includes('interview') || lowerBody.includes('next steps') || lowerBody.includes('schedule')) {
           sentiment = 'positive';
           date_time = new Date(Date.now() + 86400000).toISOString(); // tomorrow
        } else if (lowerBody.includes('unfortunately') || lowerBody.includes('regret') || lowerBody.includes('not selected')) {
           sentiment = 'negative';
        }
      }

      if (matchedEmail.targetId) {
        await db.update(outreachTargets)
          .set({ 
             status: sentiment === 'positive' ? 'interview' : (sentiment === 'negative' ? 'not_selected' : 'replied'),
             responseSentiment: sentiment 
          })
          .where(eq(outreachTargets.id, matchedEmail.targetId));
        
        if (sentiment === 'positive') {
           // Insert interview entry
           await db.insert(interviews).values({
              userId,
              targetId: matchedEmail.targetId,
              company: matchedEmail.company || 'Unknown',
              role: matchedEmail.role || 'Unknown',
              dateTime: new Date(date_time),
              platform,
              link,
              status: 'scheduled'
           });
        }
      }
      processedCount++;
    }

    res.json({ success: true, processed: processedCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sync replies' });
  }
});

// POST /api/outreach/connect-gmail — Exchanges auth code for refresh token and starts watch
router.post('/connect-gmail', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Auth code is required' });

    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage' // required for client-side auth code flow
    );

    const { tokens } = await oauth2Client.getToken(code);
    const { refresh_token, access_token } = tokens;

    if (refresh_token) {
      await db.update(users).set({ googleRefreshToken: refresh_token }).where(eq(users.id, userId));
    }

    // Call the Gmail watch API using the fresh access token
    if (access_token) {
      const watchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          topicName: process.env.PUBSUB_TOPIC_NAME || 'projects/your-gcp-project/topics/gmail-webhooks',
          labelIds: ['INBOX'],
          labelFilterAction: 'include'
        })
      });
      
      const watchData = await watchRes.json();
      if (watchRes.ok) {
        await db.update(users).set({ gmailHistoryId: watchData.historyId.toString() }).where(eq(users.id, userId));
        console.log(`[Gmail Watch] Successfully enabled for user ${userId}`);
      } else {
        console.error(`[Gmail Watch Error] Failed to enable push notifications:`, watchData);
        return res.status(500).json({ error: 'Connected to Gmail, but failed to enable push notifications. Check server logs.' });
      }
    }

    res.json({ success: true, connected: true });
  } catch (err) {
    console.error("Connect Gmail Error:", err);
    res.status(500).json({ error: 'Failed to connect Gmail' });
  }
});


export default router;
