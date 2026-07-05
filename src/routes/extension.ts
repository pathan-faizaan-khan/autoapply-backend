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

// GET /api/extension/user-data -> returns flattened user and resume data
router.get('/user-data', authenticateToken, async (req: any, res) => {
  try {
    const userId = getUserId(req);

    // Fetch the most recent resume
    const latestResumes = await db.select().from(resumes)
      .where(eq(resumes.userId, userId))
      .orderBy(desc(resumes.createdAt))
      .limit(1);

    if (latestResumes.length === 0) {
      return res.status(404).json({ error: 'No resume found', complete_profile_required: true });
    }
    const resume = latestResumes[0];

    const [personalInfo] = await db.select().from(resumePersonalInfo).where(eq(resumePersonalInfo.resumeId, resume.id));
    const experiences = await db.select().from(resumeExperiences).where(eq(resumeExperiences.resumeId, resume.id));
    const educations = await db.select().from(resumeEducations).where(eq(resumeEducations.resumeId, resume.id));
    const skills = await db.select().from(resumeSkills).where(eq(resumeSkills.resumeId, resume.id));
    const projects = await db.select().from(resumeProjects).where(eq(resumeProjects.resumeId, resume.id));
    
    // Formatting to flat key-values to pass to the ML backend mapping easily
    const userData = {
      first_name: personalInfo?.name ? personalInfo.name.split(' ')[0] : '',
      last_name: personalInfo?.name ? personalInfo.name.split(' ').slice(1).join(' ') : '',
      email: personalInfo?.email || '',
      phone: personalInfo?.phone || '',
      linkedin_url: personalInfo?.linkedinUrl || '',
      github_url: personalInfo?.githubUrl || '',
      portfolio_url: personalInfo?.portfolioUrl || '',
      years_of_experience: '3', // Default or compute from experiences if possible
      skills: skills.map(s => s.name).join(', '),
      highest_education: educations.length > 0 ? `${educations[0].degree} from ${educations[0].institution}` : '',
      summary: personalInfo?.summary || '',
      // We can also stringify experiences if ML backend needs full context
      experience_details: experiences.map(e => `${e.jobTitle} at ${e.companyName} (${e.dateRange}): ${e.description}`).join(' | '),
      project_details: projects.map(p => `${p.name}: ${p.description}`).join(' | '),
    };

    res.json({ success: true, userData });
  } catch (err) {
    console.error('Extension fetch user-data error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
