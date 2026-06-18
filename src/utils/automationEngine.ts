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
  resumeEducations
} from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import puppeteer from 'puppeteer';
import { generateResumeHtml } from './resumeTemplate.js';

export async function runAutomationEngine(
  campaignId: number, 
  targetEmailCount: number, 
  googleAccessToken: string,
  fastApiUrl: string
) {
  console.log(`[Automation] Starting campaign ${campaignId} for ${targetEmailCount} emails`);
  
  try {
    // 1. Mark campaign as running
    await db.update(outreachCampaigns).set({ automationStatus: 'running' }).where(eq(outreachCampaigns.id, campaignId));
    
    const [campaign] = await db.select().from(outreachCampaigns).where(eq(outreachCampaigns.id, campaignId));
    if (!campaign) throw new Error("Campaign not found");

    const targetRoles = JSON.parse(campaign.targetRoles || "[]");
    const companyTypes = JSON.parse(campaign.companyTypes || "[]");
    
    // 2. Fetch User's Resume Context
    const [latestResume] = await db.select().from(resumes)
      .where(eq(resumes.userId, campaign.userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);
    
    if (!latestResume) throw new Error("No resume found for user");

    const [personalInfo] = await db.select().from(resumePersonalInfo).where(eq(resumePersonalInfo.resumeId, latestResume.id));
    const experiences = await db.select().from(resumeExperiences).where(eq(resumeExperiences.resumeId, latestResume.id));
    const skills = await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, latestResume.id));
    const projects = await db.select().from(resumeProjects).where(eq(resumeProjects.resumeId, latestResume.id));
    const education = await db.select().from(resumeEducations).where(eq(resumeEducations.resumeId, latestResume.id));

    const resumeContext = {
      personalInfo,
      summary: personalInfo?.summary || '',
      experience: experiences,
      skills: skills.map(s => s.name),
      projects,
      education
    };

    let sentCount = 0;

    // 3. Search for jobs/companies
    for (const role of targetRoles) {
      if (sentCount >= targetEmailCount) break;

      console.log(`[Automation] Searching jobs for role: ${role}`);
      const searchRes = await fetch(`${fastApiUrl}/api/jobs/google-search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: role,
          location: campaign.workStyle === "Remote" ? "remote" : (campaign.locationPref || "any"),
          company_type: (companyTypes[0] || "any").toLowerCase(),
          num_results: targetEmailCount * 2, // overfetch to account for missing contacts
        }),
      });

      if (!searchRes.ok) {
        console.error(`[Automation] /api/jobs/google-search failed with status ${searchRes.status}`);
        continue;
      }
      const { jobs } = await searchRes.json();
      console.log(`[Automation] Found ${jobs?.length || 0} jobs for role ${role}`);

      // 4. Process each company
      for (const job of jobs || []) {
        if (sentCount >= targetEmailCount) break;
        
        console.log(`[Automation] Finding contacts at ${job.company_name}`);
        const contactRes = await fetch(`${fastApiUrl}/api/jobs/find-contacts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: job.company_name,
            domain: job.domain || "",
            target_role: "Recruiter OR Engineering Manager",
          }),
        });

        if (!contactRes.ok) {
          console.error(`[Automation] /api/jobs/find-contacts failed for ${job.company_name} with status ${contactRes.status}`);
          continue;
        }
        const contactData = await contactRes.json();
        const contact = contactData.contacts?.[0];
        
        if (!contact || !contact.email) {
          console.log(`[Automation] No email found for ${job.company_name}, skipping.`);
          continue;
        }

        console.log(`[Automation] Found contact ${contact.email}, tailoring resume...`);

        // 5. Tailor Resume
        let tailored_resume;
        try {
          const tailorRes = await fetch(`${fastApiUrl}/api/resume/tailor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              job_title: job.title,
              job_description: job.description || "",
              resume_data: resumeContext,
              candidate_name: personalInfo?.name || "Candidate",
            }),
          });
          
          if (!tailorRes.ok) {
            const errText = await tailorRes.text();
            throw new Error(`Tailor API failed: ${tailorRes.status} ${errText}`);
          }
          const tailorData = await tailorRes.json();
          tailored_resume = tailorData.tailored_resume || resumeContext;
        } catch (tailorErr) {
          console.error(`[Automation] Resume tailoring failed, using original resume:`, tailorErr);
          tailored_resume = resumeContext;
        }

        // 6. Generate Email Body
        const genRes = await fetch(`${fastApiUrl}/api/email/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contact_name: contact.name,
            contact_title: contact.title || "",
            company_name: job.company_name,
            job_title: job.title,
            job_description: job.description || "",
            candidate_name: personalInfo?.name || "Candidate",
            candidate_skills: resumeContext.skills,
            candidate_summary: resumeContext.summary,
            candidate_experience_summary: resumeContext.experience.slice(0, 2).map((e:any) => `${e.jobTitle} at ${e.companyName}`).join(", ")
          }),
        });

        const { subject, body } = await genRes.json();

        // 7. Save to DB
        const [target] = await db.insert(outreachTargets).values({
          campaignId,
          companyName: job.company_name,
          companyDomain: job.domain || null,
          jobTitle: job.title,
          jobUrl: job.job_url,
          jobDescription: job.description || null,
          matchScore: job.match_score || 80,
          contactName: contact.name,
          contactEmail: contact.email,
          contactTitle: contact.title || null,
          contactLinkedin: contact.linkedin || null,
          status: 'emailed'
        }).returning();

        const [emailRecord] = await db.insert(coldEmails).values({
          targetId: target.id,
          userId: campaign.userId,
          subject,
          body,
          tailoredResumeJson: JSON.stringify(tailored_resume),
          status: 'sent',
          sentAt: new Date()
        }).returning();

        // 8. Generate PDF
        let pdfBuffer: Buffer;
        try {
          const htmlContent = generateResumeHtml(tailored_resume);
          const browser = await puppeteer.launch({ headless: true });
          const page = await browser.newPage();
          await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
          const uint8Array = await page.pdf({ format: 'A4', printBackground: true });
          pdfBuffer = Buffer.from(uint8Array);
          await browser.close();
        } catch (e) {
          pdfBuffer = Buffer.from("Error generating tailored resume PDF.");
        }

        // 9. Send via Gmail API
        const boundary = 'boundary12345';
        const messageParts = [
          `To: ${contact.email}`,
          `Subject: ${subject}`,
          'MIME-Version: 1.0',
          `Content-Type: multipart/mixed; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset="UTF-8"',
          '',
          body,
          '',
          `--${boundary}`,
          `Content-Type: application/pdf; name="Tailored_Resume.pdf"`,
          `Content-Disposition: attachment; filename="Tailored_Resume.pdf"`,
          `Content-Transfer-Encoding: base64`,
          '',
          pdfBuffer.toString('base64'),
          '',
          `--${boundary}--`
        ];

        const rawMessage = messageParts.join('\r\n');
        const encodedMessage = Buffer.from(rawMessage).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

        const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${googleAccessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ raw: encodedMessage }),
        });

        if (!gmailRes.ok) {
          console.error(`[Automation] Failed to send email to ${contact.email}`);
          // Revert status
          await db.update(coldEmails).set({ status: 'draft' }).where(eq(coldEmails.id, emailRecord.id));
          continue;
        }

        console.log(`[Automation] Successfully sent email to ${contact.email}`);
        
        sentCount++;
        await db.update(outreachCampaigns).set({ emailsSentCount: sentCount }).where(eq(outreachCampaigns.id, campaignId));
      }
    }

    console.log(`[Automation] Campaign ${campaignId} finished. Sent ${sentCount} emails.`);
    await db.update(outreachCampaigns).set({ automationStatus: 'completed' }).where(eq(outreachCampaigns.id, campaignId));

  } catch (error) {
    console.error(`[Automation] Campaign ${campaignId} failed:`, error);
    await db.update(outreachCampaigns).set({ automationStatus: 'failed' }).where(eq(outreachCampaigns.id, campaignId));
  }
}
