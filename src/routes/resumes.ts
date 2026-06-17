import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { db } from '../db/index.js';
import { 
  resumes, 
  resumePersonalInfo, 
  resumeExperiences, 
  resumeEducations, 
  resumeSkills,
  resumeProjects,
  resumeCertifications,
  resumeLanguages,
  userProfiles
} from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

const router = Router();

// Helper to get userId
const getUserId = (req: any) => {
  return req.user!.userId;
};

// ── GET: Fetch all resumes (with profile data) for the current user ──
router.get('/', async (req: any, res) => {
  try {
    const userId = getUserId(req);

    // Fetch all resumes ordered by newest first
    const allResumes = await db.select().from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt));

    // For each resume, fetch the nested profile details
    const populated = await Promise.all(allResumes.map(async (resume) => {
      const [personalInfo] = await db.select().from(resumePersonalInfo).where(eq(resumePersonalInfo.resumeId, resume.id));
      const experiences = await db.select().from(resumeExperiences).where(eq(resumeExperiences.resumeId, resume.id));
      const educations = await db.select().from(resumeEducations).where(eq(resumeEducations.resumeId, resume.id));
      const skills = await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, resume.id));
      const projects = await db.select().from(resumeProjects).where(eq(resumeProjects.resumeId, resume.id));
      const certifications = await db.select().from(resumeCertifications).where(eq(resumeCertifications.resumeId, resume.id));
      const languages = await db.select().from(resumeLanguages).where(eq(resumeLanguages.resumeId, resume.id));

      return {
        ...resume,
        personalInfo: personalInfo || null,
        experiences,
        educations,
        skills: skills.map(s => s.name),
        projects,
        certifications,
        languages
      };
    }));

    res.json({ resumes: populated });
  } catch (error) {
    console.error('Error fetching resumes:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST: Save a new parsed resume profile ──
router.post('/', async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { 
      s3Url, 
      fileName, 
      atsScore, 
      parsedData, // Expected: { name, email, phone, experience[], education[], skills[] }
      rawText
    } = req.body;

    // 1. Create the base resume record
    const [newResume] = await db.insert(resumes).values({
      userId,
      s3Url,
      fileName,
      atsScore: atsScore || null
    }).returning();

    const resumeId = newResume.id;

    // 2. Insert Personal Info
    if (parsedData?.personalInfo) {
      const pi = parsedData.personalInfo;
      await db.insert(resumePersonalInfo).values({
        resumeId,
        name: pi.name || '',
        email: pi.email || '',
        phone: pi.phone || '',
        linkedinUrl: pi.linkedin || '',
        githubUrl: pi.github || '',
        portfolioUrl: pi.portfolio || '',
        summary: pi.summary || ''
      });
    }

    // 3. Insert Experiences
    if (Array.isArray(parsedData?.experience) && parsedData.experience.length > 0) {
      const expValues = parsedData.experience.map((exp: any) => ({
        resumeId,
        jobTitle: exp.jobTitle || '',
        companyName: exp.companyName || '',
        dateRange: exp.dateRange || '',
        description: exp.description || ''
      }));
      await db.insert(resumeExperiences).values(expValues);
    }

    // 4. Insert Educations
    if (Array.isArray(parsedData?.education) && parsedData.education.length > 0) {
      const eduValues = parsedData.education.map((edu: any) => ({
        resumeId,
        degree: edu.degree || '',
        institution: edu.institution || '',
        year: edu.year || '',
        gpa: edu.gpa || ''
      }));
      await db.insert(resumeEducations).values(eduValues);
    }

    // 5. Insert Skills
    if (Array.isArray(parsedData?.skills) && parsedData.skills.length > 0) {
      const skillValues = parsedData.skills.map((skill: string) => ({
        resumeId,
        name: skill
      }));
      await db.insert(resumeSkills).values(skillValues);
    }

    // 6. Insert Projects
    if (Array.isArray(parsedData?.projects) && parsedData.projects.length > 0) {
      const projValues = parsedData.projects.map((proj: any) => ({
        resumeId,
        name: proj.name || '',
        technologies: proj.technologies || '',
        description: proj.description || '',
        link: proj.link || ''
      }));
      await db.insert(resumeProjects).values(projValues);
    }

    // 7. Insert Certifications
    if (Array.isArray(parsedData?.certifications) && parsedData.certifications.length > 0) {
      const certValues = parsedData.certifications.map((cert: any) => ({
        resumeId,
        name: cert.name || '',
        issuer: cert.issuer || '',
        date: cert.date || ''
      }));
      await db.insert(resumeCertifications).values(certValues);
    }

    // 8. Insert Languages
    if (Array.isArray(parsedData?.languages) && parsedData.languages.length > 0) {
      const langValues = parsedData.languages.map((lang: any) => ({
        resumeId,
        name: lang.name || '',
        proficiency: lang.proficiency || ''
      }));
      await db.insert(resumeLanguages).values(langValues);
    }

    // 9. Update User Profile
    const [existingProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    const pi = parsedData?.personalInfo || {};
    const skillsArr = Array.isArray(parsedData?.skills) ? parsedData.skills : [];
    
    if (!existingProfile) {
      await db.insert(userProfiles).values({
        userId,
        linkedInUrl: pi.linkedin || '',
        githubUrl: pi.github || '',
        portfolioUrl: pi.portfolio || '',
        phone: pi.phone || '',
        address: '',
        skills: skillsArr.join(', '),
        resumeText: rawText || pi.summary || '',
      });
    } else {
      const updates: any = {};
      if (!existingProfile.linkedInUrl && pi.linkedin) updates.linkedInUrl = pi.linkedin;
      if (!existingProfile.githubUrl && pi.github) updates.githubUrl = pi.github;
      if (!existingProfile.portfolioUrl && pi.portfolio) updates.portfolioUrl = pi.portfolio;
      if (!existingProfile.phone && pi.phone) updates.phone = pi.phone;
      if (!existingProfile.skills && skillsArr.length > 0) updates.skills = skillsArr.join(', ');
      if (!existingProfile.resumeText && (rawText || pi.summary)) updates.resumeText = rawText || pi.summary;
      
      if (Object.keys(updates).length > 0) {
        await db.update(userProfiles).set(updates).where(eq(userProfiles.userId, userId));
      }
    }

    res.status(201).json({ success: true, resumeId });
  } catch (error) {
    console.error('Error saving parsed resume:', error);
    res.status(500).json({ error: 'Failed to save resume profile' });
  }
});

// ── DELETE: Remove a resume (cascades to all connected DB rows) ──
router.delete('/:id', async (req: any, res) => {
  try {
    const resumeId = parseInt(req.params.id);
    const userId = getUserId(req);

    // Ensure it belongs to the user
    const [target] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    if (!target || target.userId !== userId) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    // Delete (Drizzle schema handles cascade for related tables)
    await db.delete(resumes).where(eq(resumes.id, resumeId));

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting resume:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PUT: Manual entry / edits for specific details ──
router.put('/:id/personal-info', async (req: any, res) => {
  try {
    const resumeId = parseInt(req.params.id);
    const { name, email, phone } = req.body;
    
    // Check ownership
    const [target] = await db.select().from(resumes).where(eq(resumes.id, resumeId));
    if (!target || target.userId !== getUserId(req)) return res.status(403).json({ error: 'Forbidden' });

    // Upsert personal info
    const existing = await db.select().from(resumePersonalInfo).where(eq(resumePersonalInfo.resumeId, resumeId));
    if (existing.length > 0) {
      await db.update(resumePersonalInfo).set({ name, email, phone }).where(eq(resumePersonalInfo.resumeId, resumeId));
    } else {
      await db.insert(resumePersonalInfo).values({ resumeId, name, email, phone });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Update failed' });
  }
});

// (Additional PUT routes for individual experience/education edits can be added here)

export default router;
